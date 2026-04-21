import type { SearchResult, SearchOptions, ApiKeys } from "./types";
import { nvidiaComplete } from "./providers/nvidia";
import { openrouterComplete } from "./providers/openrouter";

// ── Search Result Parser ───────────────────────────────────────
// Both NVIDIA and OpenRouter return generated text → parse into SearchResult[]

function parseGeneratedResults(content: string, maxResults: number): SearchResult[] {
  // Try JSON first
  try {
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fence ? fence[1] : content;
    const parsed = JSON.parse(raw);
    const items: unknown[] = Array.isArray(parsed) ? parsed : parsed.results ?? parsed.sources ?? [];
    return items.slice(0, maxResults).map((r: unknown, i: number) => {
      const item = r as Record<string, string>;
      return {
        title: item.title ?? `Source ${i + 1}`,
        url: item.url ?? "",
        snippet: item.snippet ?? item.summary ?? item.description ?? "",
        domain: item.domain ?? extractDomain(item.url ?? ""),
        relevanceScore: 1 - i * 0.08,
      };
    });
  } catch {
    // Fall back to line-by-line parsing of numbered lists
    const lines = content.split("\n").filter(Boolean);
    const results: SearchResult[] = [];
    for (const line of lines) {
      const urlMatch = line.match(/https?:\/\/[^\s)"<>]+/);
      if (urlMatch) {
        const url = urlMatch[0];
        results.push({
          title: extractTitleFromUrl(url),
          url,
          snippet: line.replace(url, "").replace(/^\s*[\-\*\d.]+\s*/, "").trim().slice(0, 250),
          domain: extractDomain(url),
          relevanceScore: 1 - results.length * 0.08,
        });
      }
      if (results.length >= maxResults) break;
    }
    return results;
  }
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function extractTitleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    return last.replace(/[-_]/g, " ").replace(/\.\w+$/, "").trim() || extractDomain(url);
  } catch { return url; }
}

// ── Search system prompt ───────────────────────────────────────

function buildSearchMessages(query: string, searchTerms: string[], maxResults: number, mode: string) {
  const termsText = searchTerms.length > 0 ? `\nOptimized search terms provided by upstream agent: ${searchTerms.join(", ")}\nUse these terms to find MORE SPECIFIC and RELEVANT sources.` : "";

  const modeInstructions = {
    deep: "Focus on academic papers, peer-reviewed journals, research institutions, and in-depth technical analysis. Prioritize: arxiv.org, scholar.google.com, nature.com, sciencedirect.com, ieee.org, acm.org.",
    corpus: "Focus on scientific literature, systematic reviews, meta-analyses, and foundational research papers. Prioritize: arxiv.org, pubmed.ncbi.nlm.nih.gov, jstor.org, springer.com, wiley.com.",
    pro: "Focus on authoritative professional sources: official documentation, industry reports, reputable news outlets, expert analyses, and government publications. Mix academic and practical sources.",
  };

  return [
    {
      role: "system" as const,
      content: `You are a research source generator. Your job is to produce ${maxResults} highly relevant, diverse, and authoritative search result entries for the given research query.

MODE: ${mode === "deep" ? "Academic/In-depth" : mode === "corpus" ? "Scientific Literature" : "Professional Research"}
${modeInstructions[mode as keyof typeof modeInstructions] || modeInstructions.pro}
${termsText}

REQUIREMENTS FOR EACH SOURCE:
- "title": A specific, descriptive title that clearly indicates what the source covers
- "url": A realistic, well-formed URL from a real domain (e.g., https://en.wikipedia.org/wiki/Topic_Name, https://arxiv.org/abs/XXXX.XXXXX, https://docs.example.com/guide/topic)
- "snippet": A detailed 2-4 sentence excerpt that provides SUBSTANTIVE information about the topic — include specific facts, data points, or key arguments. This snippet will be used by downstream research agents, so make it information-rich.
- "domain": The domain name only (e.g., "arxiv.org", "wikipedia.org")

SOURCE DIVERSITY REQUIREMENTS:
- Include at least 2 different source types (e.g., encyclopedia, academic paper, official docs, news article, technical blog)
- No more than 2 results from the same domain
- Each snippet should cover a DIFFERENT aspect or dimension of the topic
- Snippets must contain SPECIFIC information — not vague summaries

Return ONLY a valid JSON array of exactly ${maxResults} objects. No markdown fences, no extra text.`,
    },
    {
      role: "user" as const,
      content: `Research query: "${query}"`,
    },
  ];
}

// ── NVIDIA-powered Search ──────────────────────────────────────
// Uses a fast/balanced model to generate structured search results

async function searchViaNvidia(
  apiKey: string,
  query: string,
  searchTerms: string[],
  maxResults: number,
  mode: string
): Promise<SearchResult[]> {
  const response = await nvidiaComplete(apiKey, {
    model: "abacusai/dracarys-llama-3.1-70b-instruct",   // fast, balanced
    messages: buildSearchMessages(query, searchTerms, maxResults, mode),
    maxTokens: 3000,
    temperature: 0.4,
  });
  return parseGeneratedResults(response.content, maxResults);
}

// ── OpenRouter-powered Search ─────────────────────────────────
// Uses Llama 3.3 70B (free) as primary; GLM-4.5 Air as secondary

async function searchViaOpenRouter(
  apiKey: string,
  query: string,
  searchTerms: string[],
  maxResults: number,
  mode: string
): Promise<SearchResult[]> {
  const response = await openrouterComplete(apiKey, {
    model: "meta-llama/llama-3.3-70b-instruct:free",
    messages: buildSearchMessages(query, searchTerms, maxResults, mode),
    maxTokens: 3000,
    temperature: 0.4,
    jsonMode: true,
  });
  return parseGeneratedResults(response.content, maxResults);
}

// ── Public API: Search with Fallback ───────────────────────────
// Primary: NVIDIA NIM → Fallback: OpenRouter

export async function searchWithFallback(
  options: SearchOptions,
  apiKeys: ApiKeys
): Promise<{ results: SearchResult[]; provider: "nvidia" | "openrouter" }> {
  const { query, maxResults, mode } = options;

  // Primary: NVIDIA NIM search
  if (apiKeys.nvidiaKey) {
    try {
      const results = await searchViaNvidia(
        apiKeys.nvidiaKey,
        options.enhanced_query || options.query,
        options.search_terms || [],
        options.maxResults,
        mode
      );
      if (results.length > 0) {
        console.log("[search-router] NVIDIA search OK:", results.length, "results");
        return { results, provider: "nvidia" };
      }
    } catch (err) {
      console.warn("[search-router] NVIDIA search failed, trying OpenRouter:", err);
    }
  }

  // Fallback: OpenRouter search
  if (apiKeys.openrouterKey) {
    try {
      const results = await searchViaOpenRouter(
        apiKeys.openrouterKey,
        options.enhanced_query || options.query,
        options.search_terms || [],
        options.maxResults,
        mode
      );
      if (results.length > 0) {
        console.log("[search-router] OpenRouter search OK:", results.length, "results");
        return { results, provider: "openrouter" };
      }
    } catch (error) {
      console.warn("[search-router] OpenRouter search failed:", error);
    }
  }

  // Both failed — return empty
  console.warn("[search-router] All search providers failed, returning empty");
  return { results: [], provider: "openrouter" };
}
