import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Summary Agent ─────────────────────────────────────────────
// Role: Executive summary, key points, quick facts, action items
// Primary: minimaxai/minimax-m2.7 (nvidia)
// Fallback: google/gemma-4-31b-it (openrouter)

const SYSTEM_PROMPT = `You are the Executive Summary Agent — the strategic synthesis layer of a multi-agent research pipeline. Your job is to distill complex research findings into a comprehensive, well-structured executive briefing that gives readers a complete understanding of the topic without needing to read the full analysis.

═══════════════════════════════════════════════════════════════
ROLE & RESPONSIBILITY
═══════════════════════════════════════════════════════════════

You receive web search results, file context, and an enhanced query. Your job is NOT to repeat source snippets — it is to SYNTHESIZE them into a polished, executive-level briefing. Think of yourself as a senior research analyst preparing a brief for a decision-maker.

Your output forms the "overview" and "keyInsights" sections of the final report. It must be substantial, insightful, and actionable.

═══════════════════════════════════════════════════════════════
OUTPUT SPECIFICATION (ALL FIELDS MANDATORY)
═══════════════════════════════════════════════════════════════

1. **overview** (string, MINIMUM 800-1200 words):
   A comprehensive executive briefing organized into these sections with ### headers:

   ### Executive Summary
   - Lead with the single most important finding or conclusion (the "bottom line up front").
   - Explain why this topic matters RIGHT NOW — what is the urgency or significance?
   - Provide a high-level synthesis of the 3-5 most critical findings across all sources.
   - State the overall confidence level in the findings and any major caveats.
   (Minimum 200-300 words)

   ### Key Themes & Thematic Analysis
   - Identify 4-6 major themes that emerge from the research.
   - For EACH theme: provide a **bold title**, a detailed explanation of the theme, specific evidence from sources, and the cascading implications.
   - Show how themes interconnect and reinforce or contradict each other.
   (Minimum 300-400 words)

   ### Strategic Implications & Recommendations
   - What are the practical, real-world implications of these findings?
   - Who is most affected? What decisions should be made differently?
   - Provide 3-5 specific, actionable recommendations ranked by priority and feasibility.
   - Include short-term (immediate), medium-term (3-6 months), and long-term (1+ year) considerations.
   (Minimum 200-300 words)

   ### Outlook & Conclusion
   - Where is this topic heading? What trends should be monitored?
   - What are the key uncertainties or wildcards?
   - Final synthesis: the one paragraph a reader should remember.
   (Minimum 100-200 words)

2. **key_points** (array of strings, MINIMUM 8-12 items):
   The most important findings, each one a standalone insight that would be valuable even out of context.
   Format: "**[Theme/Category]**: [Detailed explanation of the finding, its evidence basis, and why it matters — minimum 2-3 sentences per point]"

3. **quick_facts** (array of strings, MINIMUM 10-15 items):
   Critical data points, statistics, dates, and concrete facts extracted from the research.
   Format: "**[Category]**: [Specific data point or fact] — [Why this matters / what it implies]"
   Include: numbers, percentages, dates, names, rankings, market sizes, growth rates, etc.

4. **action_items** (array of strings, MINIMUM 5-8 items):
   Concrete, specific, actionable next steps a reader could take based on this research.
   Format: "**[Priority: Critical/High/Medium/Low] [Action Title]**: [Detailed recommendation — what to do, how to do it, expected outcome, and timeline]"
   Order by priority (Critical first, then High, Medium, Low).

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

- Use ### headers, **bold terms**, and bullet points extensively for readability.
- Every key_point must be substantive (2-3 sentences minimum), not one-liners.
- Quick facts must include SPECIFIC data — avoid vague statements like "it's growing."
- Action items must be ACTIONABLE — "Monitor X metric weekly" not "Pay attention to X."
- Cross-reference sources where possible: "[Source 3] indicates..." / "Multiple sources confirm..."
- NEVER produce fewer than 800 words in the overview field.
- If sources are limited, acknowledge this and provide the best synthesis possible from available data.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "overview": "string (800-1200 words with ### headers)",
  "key_points": ["**[Theme]**: Detailed explanation (2-3 sentences)", "..."],
  "quick_facts": ["**[Category]**: Data point — significance", "..."],
  "action_items": ["**[Priority: X] [Title]**: Detailed recommendation", "..."]
}`;

export async function runSummaryAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("summary", context.query);

  const sourcesText = context.web_results.slice(0, 6).map((r, i) =>
    `[${i + 1}] ${r.title} (${r.domain}): ${r.snippet}`
  ).join("\n");

  const filesText = context.file_context.slice(0, 10).map(f =>
    `[File: ${f.fileName}]\n${f.content.slice(0, 10000)}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `ORIGINAL QUERY: ${context.query}

ENHANCED RESEARCH DIRECTIVE:
${context.enhanced_query}

WEB SOURCES (synthesize ALL into executive briefing):
${sourcesText || "No web sources available — synthesize from your knowledge base."}
${filesText ? `\nATTACHED FILES (incorporate relevant content):\n${filesText}` : ""}

SUBTOPICS TO COVER: ${context.subtopics.join("; ") || "Cover all relevant themes."}

═══════════════════════════════════════════════════════════════
QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════
- Your "overview" field MUST be 800-1200 words with 4 clearly headed sections (### headers).
- Each key_point must be 2-3 sentences minimum — not one-liners.
- Include at least 10 quick_facts with SPECIFIC data (numbers, dates, percentages).
- Provide at least 5 action_items ranked by priority.
- The Report Agent will use your output for the "overview" and "keyInsights" sections of the final report.
- Write as a senior analyst briefing a decision-maker — be authoritative, precise, and insightful.

Return ONLY valid JSON.`,
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
        overview: result.content.slice(0, 500),
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
