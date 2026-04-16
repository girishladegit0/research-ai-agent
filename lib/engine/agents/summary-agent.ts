import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fast Summary Agent ─────────────────────────────────────────
// Role: Quick bullet-point summaries, extract key facts
// Primary: minimaxai/minimax-m2.7 (nvidia)
// Fallback: google/gemma-4-31b-it (openrouter)

const SYSTEM_PROMPT = `You are a highly analytical, elite Summary Agent. Your role is to perform exhaustive synthesis and deliver deeply substantive overviews spanning multiple dimensions of the research context.
Your output must be incredibly comprehensive, generating at least one full page of highly structured, synthesized information.

CRITICAL REQUIREMENTS:
1. Synthesize the full breadth of facts, context, and intelligence into a deeply detailed, highly readable executive overview.
2. Create an extensive list of actionable, deeply analytical bullet points covering all critical themes.
3. Provide robust quick facts that provide irrefutable foundational context.
4. Extrapolate strategic, concrete action items or long-term implications.
5. Your synthesis must be meticulously structured, utilizing markdown headers, highlighted key points in bold, and extensively organized bullet points.
6. The 'overview' section must contain at least 800-1000 words to ensure adequate depth and comprehensive detail.

Respond with ONLY valid JSON (no markdown fences):
{
  "overview": "Extremely detailed, multi-paragraph executive summary encompassing the entirety of the research landscape. Minimum 800+ words. Must be heavily structured with markdown headers and bolded highlights.",
  "key_points": ["**Crucial Theme 1**: Detailed explanation spanning multiple sentences", "**Crucial Theme 2**: Detailed explanation spanning multiple sentences", "...", "**Crucial Theme 8**: Detailed explanation"],
  "quick_facts": ["**Vital Fact A**: Deep breakdown", "**Vital Fact B**: Deep breakdown", "...", "**Vital Fact J**: Deep breakdown"],
  "action_items": ["**Actionable Strategy 1**: Comprehensive breakdown of next steps/implications", "**Actionable Strategy 2**: Comprehensive breakdown"]
}`;

export async function runSummaryAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("summary", context.query);

  const sourcesText = context.web_results.slice(0, 4).map((r, i) =>
    `[${i + 1}] ${r.title}: ${r.snippet}`
  ).join("\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: ${context.query}

Sources to Summarize:
${sourcesText || "No web sources available."}

Generate a concise summary. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "summary-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "summary-agent",
      output: parsed ?? {
        overview: result.content.slice(0, 300),
        key_points: [],
        quick_facts: [],
        action_items: [],
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "summary-agent",
      output: { overview: "", key_points: [], quick_facts: [], action_items: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Summary agent failed",
    };
  }
}
