import type { ApiKeys, AgentResult, AgentName, ResolvedModel, LLMMessage } from "../types";
import { generateAIResponse } from "../providers";
import { classifyError } from "../errors";

// ── Timeouts ──────────────────────────────────────────────────
const PRIMARY_TIMEOUT_MS = 90_000;   // 90s per-model timeout (generous for large JSON generation)
const FALLBACK_RACE_MS   = 45_000;   // start fallback after 45s if primary is still pending
const REPORT_TIMEOUT_MS  = 180_000;  // report agent gets 3 min for 5-6 page synthesis

// ── Base: Call LLM with race-based fallback ──────────────────
// Strategy: fire primary immediately. After FALLBACK_RACE_MS, if
// primary hasn't resolved, fire fallback concurrently. First to
// succeed wins. If fallback also fails, keep waiting for primary.

export async function callWithFallback(
  agent: AgentName,
  primary: ResolvedModel,
  fallback: ResolvedModel,
  messages: LLMMessage[],
  maxTokens: number,
  apiKeys: ApiKeys,
  opts?: { temperature?: number }
): Promise<{ content: string; model_used: string; provider: string; isFallback: boolean }> {

  const isReport = agent === "report-agent";
  const timeoutMs = isReport ? REPORT_TIMEOUT_MS : PRIMARY_TIMEOUT_MS;

  const callModel = (model: ResolvedModel, overrideTimeout?: number) =>
    generateAIResponse({
      model: model.id,
      provider: model.provider,
      messages,
      stream: false,
      apiKeys,
      maxTokens,
      temperature: opts?.temperature ?? 0.3,
      timeoutMs: overrideTimeout ?? timeoutMs,
    });

  // Keep a reference to the primary call so we can await it even after race timeout
  const primaryPromise = callModel(primary);

  // 1. Try primary within race window
  try {
    const res = await Promise.race([
      primaryPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__RACE_TIMEOUT__")), FALLBACK_RACE_MS)
      ),
    ]);
    return {
      content: res.content,
      model_used: primary.id,
      provider: primary.provider,
      isFallback: false,
    };
  } catch (primaryErr) {
    const isRaceTimeout =
      primaryErr instanceof Error && primaryErr.message === "__RACE_TIMEOUT__";

    if (isRaceTimeout) {
      // Primary still running — race it against fallback
      console.warn(`[${agent}] Primary ${primary.id} slow (>${FALLBACK_RACE_MS}ms), racing fallback ${fallback.id}`);

      const primaryWrapped = primaryPromise.then(res => ({
        content: res.content,
        model_used: primary.id,
        provider: primary.provider,
        isFallback: false,
      }));

      const fallbackWrapped = callModel(fallback).then(res => ({
        content: res.content,
        model_used: fallback.id,
        provider: fallback.provider,
        isFallback: true,
      }));

      // Wait for whichever finishes first successfully
      try {
        const winner = await Promise.any([primaryWrapped, fallbackWrapped]);
        return winner;
      } catch {
        // Both rejected — this is the AggregateError case
        throw new Error(`[${agent}] Both primary and fallback failed after race`);
      }
    }

    // Primary genuinely failed — try fallback, but if fallback also fails, give a clear error
    const classified = classifyError(primaryErr, primary.provider);
    console.warn(`[${agent}] Primary ${primary.id} failed (${classified.kind}), switching to ${fallback.id}`);

    try {
      const res = await callModel(fallback);
      return {
        content: res.content,
        model_used: fallback.id,
        provider: fallback.provider,
        isFallback: true,
      };
    } catch (fallbackErr) {
      const fbErr = classifyError(fallbackErr, fallback.provider);
      throw new Error(`[${agent}] Both primary and fallback failed: ${fbErr.message}`);
    }
  }
}

// ── Null result for skipped agents ────────────────────────────

export function skippedResult(agent: AgentName): AgentResult {
  return {
    agent,
    output: {},
    model_used: "none",
    provider: "none",
    durationMs: 0,
    isFallback: false,
    error: "skipped",
  };
}

// ── Safe JSON parse ────────────────────────────────────────────

export function safeParseJSON(raw: string): Record<string, unknown> | null {
  // Direct parse
  try { return JSON.parse(raw); } catch { /* continue */ }
  // Fence extraction
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* continue */ } }
  // First brace block
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* continue */ } }
  return null;
}
