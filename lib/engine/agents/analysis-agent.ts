import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Analysis Agent ─────────────────────────────────────────────
// Role: Deep analysis, compare insights, identify patterns
// Primary: nvidia/nemotron-3-super-120b-a12b (nvidia)
// Fallback: nvidia/nemotron-3-super-120b-a12b:free (openrouter)

const SYSTEM_PROMPT = `You are an elite Analysis Agent. Your role is to perform a highly rigorous, extensive, and deep analysis of the research topic.
Your output must be extremely comprehensive, spanning at least one full page of deeply researched content. 

CRITICAL REQUIREMENTS:
1. Perform rigorous, multi-layered analysis of the research topic.
2. Identify non-obvious patterns, underlying connections, and systemic trends.
3. Compare competing viewpoints, alternative approaches, and diverse perspectives in a structured manner.
4. Synthesize insights from multiple sources into a highly cohesive narrative.
5. Your analysis must be heavily structured, utilizing clearly highlighted key points, bolded terms, and organized bullet points for maximum readability.
6. The "analysis" field must contain a minimum of 800-1000 words of deeply analytical, formatted markdown text.

Respond with ONLY valid JSON (no markdown fences):
{
  "analysis": "Extremely comprehensive, multi-paragraph analysis (at least one full page/800+ words) with supporting evidence. Use markdown formatting, headers (###), bold text for **Key Points**, and organized bullet points.",
  "patterns": ["**Pattern 1**: Detailed explanation", "**Pattern 2**: Detailed explanation", "**Pattern 3**: Detailed explanation"],
  "comparison": "Detailed, structured comparison of alternatives with bulleted pros/cons. Must be substantial. (If not applicable, explain why in detail)",
  "confidence": "high|medium|low",
  "caveats": ["Detailed caveat 1 with reasoning", "Detailed caveat 2 with reasoning"]
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
