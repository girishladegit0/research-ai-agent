import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Query Intelligence Agent ───────────────────────────────────
// Role: Expand query, detect intent, generate subtopics
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are the Query Intelligence Agent — the strategic brain of a multi-agent research pipeline. Your job is to transform ANY user query into a comprehensive, multi-layered research blueprint that will guide 5 downstream agents (Analysis, Summary, Fact-Check, Coding, Report) to each produce one full page of detailed content.

═══════════════════════════════════════════════════════════════
ROLE & RESPONSIBILITY
═══════════════════════════════════════════════════════════════

You are the FIRST agent in the pipeline. Every other agent depends on YOUR output to determine what to research, how deeply to explore, and what angles to cover. If your output is shallow, the entire report will be shallow. You must be exhaustive.

═══════════════════════════════════════════════════════════════
OUTPUT SPECIFICATION (ALL FIELDS MANDATORY)
═══════════════════════════════════════════════════════════════

1. **enhanced_query** (string, MINIMUM 600-900 words):
   A deeply structured research directive organized into these sections using ### markdown headers:

   ### Research Context & Background
   - What is this topic about? Why does it matter now? What is the broader landscape?
   - Historical context, evolution, and current state of the field.

   ### Core Research Objectives
   - 5-8 specific, measurable research questions that the downstream agents must answer.
   - Each objective should target a different dimension (technical, economic, social, practical, ethical).

   ### Key Questions for Investigation
   - 8-12 deeply specific questions organized by theme.
   - Include questions about mechanisms, causality, evidence quality, counterarguments, and future implications.

   ### Methodological Approach
   - How should each downstream agent approach their analysis?
   - What evidence standards should be applied? What frameworks are relevant?
   - What biases or limitations should agents watch for?

   ### Scope Boundaries
   - What is in scope vs. out of scope for this research?
   - What level of technical depth is appropriate?

2. **intent** (string): Classify as exactly one of: coding | research | comparison | explanation | factual | general
   - "coding" = code generation, debugging, implementation, algorithm design
   - "research" = in-depth investigation, academic research, industry analysis
   - "comparison" = evaluating alternatives, pros/cons, benchmarking
   - "explanation" = explaining concepts, how things work, teaching
   - "factual" = specific facts, data points, statistics, definitions
   - "general" = broad topics that don't fit neatly into the above

3. **subtopics** (array of strings, MINIMUM 8-12 items):
   Each subtopic must be a self-contained research vector with enough detail for an agent to write a full paragraph.
   Format: "**[Subtopic Title]** — [2-3 sentence description of what to investigate, what evidence to look for, and why this angle matters]"

4. **key_concepts** (array of strings, MINIMUM 10-15 items):
   Critical terms, frameworks, and ideas that every downstream agent needs to understand.
   Format: "**[Term/Concept]** — [Precise definition + why it matters in this research context + how it relates to the query]"

5. **search_terms** (array of strings, MINIMUM 10-15 items):
   Highly optimized search queries designed to find authoritative sources.
   Format: "**[Focus Area]** — [Optimized search string using specific terminology, Boolean operators where helpful]"
   Include diverse source types: academic papers, official docs, industry reports, technical blogs, news articles.

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

- NEVER produce a shallow or abbreviated output. Even "simple" queries must be expanded into rich research directives.
- Every field must contain substantive, detailed content — no placeholders, no generic filler.
- The enhanced_query alone should be comprehensive enough that a researcher could use it as a research brief.
- Subtopics must cover MULTIPLE dimensions: technical, practical, economic, ethical, historical, comparative, and future-oriented.
- Search terms must target HIGH-QUALITY sources: arxiv.org, Wikipedia, official documentation, peer-reviewed journals, reputable news outlets, and authoritative technical blogs.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "enhanced_query": "string (600-900 words with ### headers)",
  "intent": "coding|research|comparison|explanation|factual|general",
  "subtopics": ["**[Title]** — Detailed description", "..."],
  "key_concepts": ["**[Term]** — Detailed definition and context", "..."],
  "search_terms": ["**[Focus]** — Optimized search query", "..."]
}`;

export async function runQueryIntelligenceAgent(
  query: string,
  mode: "pro" | "deep" | "corpus",
  apiKeys: ApiKeys
): Promise<AgentResult & { enhanced_query: string; subtopics: string[]; search_terms: string[] }> {
  const start = Date.now();
  const chain = selectModel("query", query);

  const modeHint: Record<string, string> = {
    pro: "Professional, well-structured research expansion.",
    deep: "Academic-grade query expansion with breadth and depth.",
    corpus: "Literature and evidence-based search directives.",
  };

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `USER QUERY: "${query}"

RESEARCH MODE: ${mode} — ${modeHint[mode] ?? ""}

PIPELINE CONTEXT: Your output will be consumed by 5 downstream agents:
1. Analysis Agent — produces deep multi-dimensional analysis (needs subtopics, key_concepts)
2. Summary Agent — produces executive briefings (needs enhanced_query overview)
3. Fact-Check Agent — validates claims and assesses reliability (needs search_terms, key_concepts)
4. Coding Agent — generates code if intent=coding (needs technical context)
5. Report Agent — synthesizes everything into a 5-6 page final report (needs ALL your fields)

QUALITY GATE: If your enhanced_query is under 600 words, or you provide fewer than 8 subtopics, the downstream agents will produce shallow output and the final report will be inadequate. Be exhaustive.

Return ONLY valid JSON.`,
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
    const search_terms: string[] = parsed
      ? (Array.isArray(parsed.search_terms) ? (parsed.search_terms as string[]) : [])
      : [];

    return {
      agent: "query-intelligence-agent",
      output: parsed ?? { enhanced_query, subtopics, search_terms },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
      enhanced_query,
      subtopics,
      search_terms,
    };
  } catch (err) {
    return {
      agent: "query-intelligence-agent",
      output: { enhanced_query: query, subtopics: [], search_terms: [] },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Query agent failed",
      enhanced_query: query,
      subtopics: [],
      search_terms: [],
    };
  }
}
