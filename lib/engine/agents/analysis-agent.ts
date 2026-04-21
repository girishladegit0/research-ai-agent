import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Analysis Agent ─────────────────────────────────────────────
// Role: Deep analysis, compare insights, identify patterns
// Primary: nvidia/nemotron-3-super-120b-a12b (nvidia)
// Fallback: nvidia/nemotron-3-super-120b-a12b:free (openrouter)

const SYSTEM_PROMPT = `You are the Deep Analysis Agent — the analytical core of a multi-agent research pipeline. Your job is to produce rigorous, exhaustive, multi-dimensional research analysis that forms the backbone of the final report.

═══════════════════════════════════════════════════════════════
ROLE & RESPONSIBILITY
═══════════════════════════════════════════════════════════════

You receive web search results, file context, and an enhanced query from upstream agents. Your job is to perform DEEP ANALYSIS — not summarization. You must synthesize information across sources, identify patterns, evaluate evidence quality, and provide original analytical insights.

Your output contributes directly to the "details" section of the final report, which must be the largest section (3000-4000 words). Your analysis alone should be 1000-1500 words minimum.

═══════════════════════════════════════════════════════════════
OUTPUT SPECIFICATION (ALL FIELDS MANDATORY)
═══════════════════════════════════════════════════════════════

1. **analysis** (string, MINIMUM 1000-1500 words):
   A deeply structured, multi-chapter analytical narrative. MUST contain ALL of the following sections with ### headers:

   ### Foundational Context & Landscape Overview
   - Comprehensive background: what is this topic, why does it matter, who are the key players?
   - Historical evolution: how did we get here? What were the key milestones and turning points?
   - Current state of the field: what is the consensus? Where are the active debates?
   (Minimum 200-300 words)

   ### Technical & Mechanistic Deep Dive
   - How does this actually work? What are the underlying mechanisms, architectures, or processes?
   - Break down complexity into understandable components with clear explanations.
   - Reference specific sources: [Source X] states that... / According to [Source Y]...
   (Minimum 250-350 words)

   ### Multi-Dimensional Impact Analysis
   - **Economic/Business Impact**: Costs, ROI, market implications, competitive dynamics.
   - **Practical/Operational Impact**: Real-world implementation challenges, adoption barriers, workflow changes.
   - **Social/Ethical Impact**: Who benefits? Who is harmed? What are the ethical considerations?
   - **Regulatory/Legal Impact**: Compliance requirements, legal frameworks, policy implications.
   (Minimum 250-350 words)

   ### Critical Evaluation & Evidence Assessment
   - What are the STRONGEST arguments/evidence supporting the main claims?
   - What are the WEAKEST points, gaps in evidence, or unresolved questions?
   - Where do sources agree? Where do they conflict? How should we weigh conflicting evidence?
   - What biases might be present in the available sources?
   (Minimum 200-300 words)

   ### Future Outlook & Strategic Implications
   - Where is this heading? What are the emerging trends?
   - What should stakeholders do differently based on this analysis?
   - What are the key uncertainties that could change the trajectory?
   (Minimum 150-200 words)

2. **patterns** (array of strings, MINIMUM 5-8 items):
   Non-obvious patterns, trends, or connections discovered through cross-source analysis.
   Format: "**Pattern [N]: [Descriptive Title]** — [Detailed evidence from sources + why this pattern matters + what it implies for the future]. Referenced in [Source X, Y]."

3. **comparison** (string, MINIMUM 300-500 words):
   A structured comparison of alternatives, approaches, or perspectives relevant to the query.
   Must include:
   - Clear criteria for comparison (at least 4-6 dimensions)
   - Explicit pros and cons for each alternative with evidence
   - A reasoned recommendation or ranking with justification
   Use markdown tables, bullet points, or structured lists for clarity.

4. **confidence** (string): "high" | "medium" | "low"
   Based on: source quality, evidence consistency, number of corroborating sources, recency of data.

5. **caveats** (array of strings, MINIMUM 5-8 items):
   Critical risks, limitations, edge cases, or conditions under which the analysis might not hold.
   Format: "**Caveat [N]: [Title]** — [Detailed description of the risk/limitation + what triggers it + specific mitigation strategy or workaround]"

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

- Reference source numbers throughout: [Source 1], [Source 3], etc.
- Use ### and #### headers to create clear document structure.
- **Bold** all key terms, findings, statistics, and important names.
- Use bullet points and numbered lists for complex multi-part information.
- Separate major sections with --- horizontal rules.
- NEVER produce fewer than 1000 words in the analysis field.
- Every claim must be traceable to a source or clearly marked as your analytical inference.
- If sources are sparse, acknowledge gaps explicitly and reason from available evidence.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "analysis": "string (1000-1500 words, deeply sectioned with ### headers)",
  "patterns": ["**Pattern N: [Name]** — Evidence and significance", "..."],
  "comparison": "string (300-500 words, structured comparison)",
  "confidence": "high|medium|low",
  "caveats": ["**Caveat N: [Title]** — Risk, trigger, and mitigation", "..."]
}`;

export async function runAnalysisAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("analysis", context.query);

  const sourcesText = context.web_results.slice(0, 8).map((r, i) =>
    `[Source ${i + 1}] ${r.title} (${r.domain})\n${r.snippet}`
  ).join("\n\n");

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

WEB SOURCES (analyze ALL of these carefully):
${sourcesText || "No web sources available — rely on your knowledge base and analytical reasoning."}
${filesText ? `\nATTACHED FILES (incorporate relevant content):\n${filesText}` : ""}

SUBTOPICS TO ADDRESS: ${context.subtopics.join("; ") || "Cover all relevant dimensions of the topic."}

═══════════════════════════════════════════════════════════════
QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════
- Your "analysis" field MUST be 1000-1500 words with 5 clearly headed sections (### headers).
- Every section must contain substantive analytical content — not summaries or restatements.
- Cross-reference sources: "According to [Source 2]..." / "[Source 4] contradicts this by..."
- Include at least 5 patterns, a 300+ word comparison, and 5 caveats.
- The Report Agent will use your output as the PRIMARY content for the final report's "details" section.

Return ONLY valid JSON.`,
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
