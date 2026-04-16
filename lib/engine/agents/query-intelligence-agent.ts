import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Query Intelligence Agent ───────────────────────────────────
// Role: Expand query, detect intent, generate subtopics
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are an elite Query Intelligence Agent specialized in profound intent analysis and generating extremely comprehensive, structured research master plans.
Your output must be highly extensive, laying the groundwork for a deeply rigorous research execution, spanning at least one full page of deeply structured intelligence content.

CRITICAL REQUIREMENTS:
1. Drastically expand the query into a comprehensively detailed, multi-faceted enhanced version that directs deep web research.
2. Identify the core intent and outline an exhaustive array of secondary and tertiary intents.
3. Generate 8-10 highly focused, intricately detailed subtopics, each demanding thorough independent research.
4. Extrapolate an extensive list of foundational key concepts and optimized semantic search terms.
5. Your output must utilize a highly structured format, employing clearly highlighted key points, bolded text, and organized bullet points for clarity and depth.
6. The enhanced query and intents must exceed 800 words combined to ensure sufficient research depth.

Respond with ONLY valid JSON (no markdown fences):
{
  "enhanced_query": "Extremely extensive, fully expanded version of the query with exhaustive context and highly detailed research directives. Minimum 800+ words. Use markdown headers, bold key points, and bulleted structures.",
  "intent": "one of: coding|research|comparison|explanation|factual|general",
  "subtopics": ["**Subtopic 1**: Deep explanation of the required research vector", "**Subtopic 2**: Deep explanation", "**Subtopic 3**: Deep explanation", "...", "**Subtopic 8**: Deep explanation"],
  "key_concepts": ["**Concept 1**: Detailed definition", "**Concept 2**: Detailed definition", "...", "**Concept 10**: Detailed definition"],
  "search_terms": ["**Search Vector A**: Detailed Boolean/Semantic breakdown", "**Search Vector B**: Detailed breakdown"]
}`;

export async function runQueryIntelligenceAgent(
  query: string,
  mode: "pro" | "deep" | "corpus",
  apiKeys: ApiKeys
): Promise<AgentResult & { enhanced_query: string; subtopics: string[] }> {
  const start = Date.now();
  const chain = selectModel("query", query);

  const modeHint: Record<string, string> = {
    pro: "Provide a professional, well-structured research expansion.",
    deep: "Conduct a thorough academic-grade query expansion with breadth.",
    corpus: "Focus on literature and evidence-based search directives.",
  };

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Query: "${query}"\nMode: ${mode}\nHint: ${modeHint[mode] ?? ""}`,
    },
  ];

  try {
    const result = await callWithFallback(
      "query-intelligence-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    const enhanced_query = parsed
      ? String(parsed.enhanced_query ?? query)
      : query;
    const subtopics: string[] = parsed
      ? (Array.isArray(parsed.subtopics) ? (parsed.subtopics as string[]) : [])
      : [];

    return {
      agent: "query-intelligence-agent",
      output: parsed ?? { enhanced_query, subtopics },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
      enhanced_query,
      subtopics,
    };
  } catch (err) {
    // Graceful degradation — return original query
    return {
      agent: "query-intelligence-agent",
      output: { enhanced_query: query, subtopics: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Query agent failed",
      enhanced_query: query,
      subtopics: [],
    };
  }
}
