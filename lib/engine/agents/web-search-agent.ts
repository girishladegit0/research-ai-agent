import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { searchWithFallback } from "../search-router";

// ── Web Search Agent ───────────────────────────────────────────
// Role: Fetch research data via NVIDIA NIM (primary) or OpenRouter (fallback)
// No Perplexity required — uses LLM-generated structured search results

export async function runWebSearchAgent(
  context: Pick<AgentContext, "query" | "enhanced_query" | "search_terms">,
  mode: "pro" | "deep" | "corpus",
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();

  try {
    const { results, provider } = await searchWithFallback(
      {
        query: context.enhanced_query || context.query,
        mode,
        maxResults: 8,
        search_terms: context.search_terms,
      },
      apiKeys
    );

    const sources = results.map((r, i) => ({
      id: String(i + 1),
      title: r.title,
      url: r.url,
      domain: r.domain,
      snippet: r.snippet,
    }));

    const summaries = results.map(r => `${r.title}: ${r.snippet}`);

    return {
      agent: "web-search-agent",
      output: { sources, summaries, raw_results: results },
      model_used: provider === "nvidia"
        ? "abacusai/dracarys-llama-3.1-70b-instruct"
        : "meta-llama/llama-3.3-70b-instruct",
      provider,
      durationMs: Date.now() - start,
      isFallback: provider !== "nvidia",
    };
  } catch (err) {
    return {
      agent: "web-search-agent",
      output: { sources: [], summaries: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Search failed",
    };
  }
}
