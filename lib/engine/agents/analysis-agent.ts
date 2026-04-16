import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Analysis Agent ─────────────────────────────────────────────
// Role: Deep analysis, compare insights, identify patterns
// Primary: nvidia/nemotron-3-super-120b-a12b (nvidia)
// Fallback: nvidia/nemotron-3-super-120b-a12b:free (openrouter)

const SYSTEM_PROMPT = `You are a deep Analysis Agent. Your role is to:
1. Perform rigorous analysis of the research topic
2. Identify non-obvious patterns and connections
3. Compare competing viewpoints or approaches
4. Synthesize insights from multiple sources

Respond with ONLY valid JSON (no markdown fences):
{
  "analysis": "comprehensive multi-paragraph analysis with supporting evidence",
  "patterns": ["key pattern 1", "key pattern 2", "key pattern 3"],
  "comparison": "structured comparison if query involves alternatives (empty string if not)",
  "confidence": "high|medium|low",
  "caveats": ["caveat 1", "caveat 2"]
}`;

export async function runAnalysisAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("analysis", context.query);

  const sourcesText = context.web_results.slice(0, 5).map((r, i) =>
    `[Source ${i + 1}] ${r.title}\n${r.snippet}`
  ).join("\n\n");

  const filesText = context.file_context.slice(0, 3).map(f =>
    `[File: ${f.fileName}]\n${f.content.slice(0, 600)}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Research Query: ${context.query}
Enhanced Query: ${context.enhanced_query}

Sources:
${sourcesText || "No web sources available."}

${filesText ? `File Context:\n${filesText}` : ""}

Subtopics to cover: ${context.subtopics.join(", ") || "N/A"}

Perform deep analysis. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "analysis-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "analysis-agent",
      output: parsed ?? { analysis: result.content, patterns: [], comparison: "", confidence: "medium", caveats: [] },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "analysis-agent",
      output: { analysis: "", patterns: [], comparison: "", confidence: "low", caveats: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Analysis agent failed",
    };
  }
}
