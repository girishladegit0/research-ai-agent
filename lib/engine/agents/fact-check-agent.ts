import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fact-Check Agent ───────────────────────────────────────────
// Role: Validate claims, detect contradictions between web data and AI reasoning
// Primary: mistralai/mistral-large-3-675b-instruct-2512 (nvidia)
// Fallback: meta-llama/llama-3.3-70b-instruct (openrouter)

const SYSTEM_PROMPT = `You are a meticulous, elite Fact-Check Agent. Your role is to perform an exhaustive, rigorous validation of claims across all available web sources and AI reasoning.
Your output must be extremely comprehensive, spanning at least one full page of structured, detailed analytical content.

CRITICAL REQUIREMENTS:
1. Conduct an exhaustive validation of the reliability of all provided sources, highlighting both explicit and implicit biases.
2. Provide deeply analytical breakdowns of contradictions between different web sources and reasoning.
3. Heavily scrutinize and dissect unverified, speculative, or controversial statements.
4. Your assessment must be highly structured, utilizing clearly highlighted key points, bolded text, and organized bullet points.
5. The 'fact_check_summary' and 'warnings' must be extensively detailed, containing at least 800-1000 words.

Respond with ONLY valid JSON (no markdown fences):
{
  "verified_claims": ["**Claim 1**: In-depth explanation with source citation", "**Claim 2**: In-depth explanation with source citation"],
  "unverified_claims": ["**Unverified Claim 1**: Extensive breakdown of why it lacks evidence", "**Unverified Claim 2**: Extensive breakdown"],
  "contradictions": ["**Contradiction A**: Detailed analysis of how Source X and Source Y diverge significantly", "**Contradiction B**: Detailed analysis"],
  "reliability_score": 85,
  "reliability_label": "High|Medium|Low",
  "fact_check_summary": "Extremely detailed, multi-paragraph overall assessment of research reliability, spanning at least 800+ words. Use markdown headers, bold key points, and bulleted structures.",
  "warnings": ["**Warning 1**: Detailed explanation of bias or limitation", "**Warning 2**: Detailed explanation"]
}`;

export async function runFactCheckAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("fact-check", context.query);

  const sourcesText = context.web_results.slice(0, 8).map((r, i) =>
    `[Source ${i + 1}] ${r.title} (${r.domain}): ${r.snippet}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Research Query: ${context.query}

Available Sources:
${sourcesText || "No web sources available."}

Cross-validate the sources regarding the query. Find agreements, contradictions, and assess reliability. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "fact-check-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "fact-check-agent",
      output: parsed ?? {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 50,
        reliability_label: "Medium",
        fact_check_summary: result.content.slice(0, 200),
        warnings: [],
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "fact-check-agent",
      output: {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 0,
        reliability_label: "Unknown",
        fact_check_summary: "Fact-check could not be completed.",
        warnings: [],
      },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Fact-check agent failed",
    };
  }
}
