import type { ApiKeys, AgentResult, AgentContext, ResearchSource } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Report Generation Agent ────────────────────────────────────
// Role: Combine ALL agent outputs into one structured final report
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are the Report Synthesis Agent — the FINAL stage of a multi-agent research pipeline. Your singular mission is to synthesize ALL upstream agent outputs into a massive, cohesive, publication-quality research report spanning 5-6 full pages.

═══════════════════════════════════════════════════════════════
YOUR CRITICAL ROLE
═══════════════════════════════════════════════════════════════

You receive the complete outputs from 5 specialized agents:
1. **Query Intelligence Agent** — research blueprint, subtopics, key concepts
2. **Executive Summary Agent** — overview, key points, quick facts, action items
3. **Deep Analysis Agent** — multi-dimensional analysis, patterns, comparison, caveats
4. **Fact-Check Agent** — verified/unverified claims, contradictions, reliability assessment
5. **Coding Agent** (if applicable) — code, explanation, pitfalls, alternatives

Your job is to WEAVE all of these outputs together into a single, unified, flowing research report. You must NOT simply concatenate their outputs — you must SYNTHESIZE, cross-reference, and create a narrative that reads as one cohesive document.

═══════════════════════════════════════════════════════════════
MANDATORY OUTPUT SPECIFICATION
═══════════════════════════════════════════════════════════════

TOTAL WORD COUNT TARGET: 4000-6000 words across ALL fields combined.

1. **overview** (string, MINIMUM 800-1000 words):
   The executive summary — must be self-contained and readable on its own.

   ### Executive Summary
   - Lead with the core finding. What is the single most important conclusion?
   - Provide comprehensive background context (what, why, who, when).
   - Synthesize the 5-7 most critical findings from across ALL agents.
   (Minimum 250-350 words)

   ### Research Methodology & Scope
   - How was this research conducted? (Multi-agent AI analysis with web sources, etc.)
   - What sources were consulted? How many? What types?
   - What is the scope and any limitations of this research?
   (Minimum 150-200 words)

   ### Key Findings at a Glance
   - 5-7 bullet points, each a **bold finding title** followed by 2-3 sentence explanation.
   - These should be the absolute most important takeaways across all agent outputs.
   (Minimum 200-250 words)

   ### Reliability & Confidence Statement
   - Overall reliability score and what it means.
   - Strongest and weakest evidence areas.
   - Key caveats readers should keep in mind.
   (Minimum 100-150 words)

2. **key_insights** (array of strings, MINIMUM 12-18 items):
   The top insights synthesized from ALL agent outputs. Each must be substantial.
   Format: "**[Insight Title]** (Source: [Agent Name]) — [Detailed 3-4 sentence explanation. Include specific evidence, data points, or examples. Explain why this insight matters and what it implies for the reader.]"

   Distribution: Include insights from EVERY agent:
   - 2-3 from Query Intelligence (about scope and research dimensions)
   - 3-4 from Analysis Agent (deep analytical findings)
   - 3-4 from Summary Agent (strategic and thematic insights)
   - 2-3 from Fact-Check Agent (verification findings)
   - 1-2 from Coding Agent (if applicable, technical insights)

3. **details** (string, THIS IS THE CORE — MINIMUM 2500-3500 words):
   The main body of the report. This must be the LONGEST field by far.
   MUST contain 6-8 substantial chapters, each with clear ### headers:

   ### Chapter 1: Foundational Context & Background
   - Comprehensive topic overview, historical development, and current landscape.
   - Key players, institutions, or technologies involved.
   - Why this topic matters now — what triggered the need for this research?
   (Minimum 350-500 words)

   ### Chapter 2: Technical / Mechanistic Deep Dive
   - How does this actually work? Core mechanisms, architectures, processes.
   - Break down complexity into understandable components.
   - Draw from Analysis Agent's technical findings.
   (Minimum 350-500 words)

   ### Chapter 3: Multi-Dimensional Impact Assessment
   - Economic, practical, social, ethical, and regulatory implications.
   - Who benefits? Who bears risks? What are the tradeoffs?
   - Draw from both Analysis and Summary Agent outputs.
   (Minimum 350-500 words)

   ### Chapter 4: Evidence Analysis & Source Review
   - Critical evaluation of available evidence.
   - Source quality, methodology assessment, data reliability.
   - Draw heavily from Fact-Check Agent's findings.
   (Minimum 300-400 words)

   ### Chapter 5: Patterns, Trends & Emerging Insights
   - Cross-source patterns identified by the Analysis Agent.
   - Emerging trends and their potential trajectories.
   - Non-obvious connections between different aspects of the topic.
   (Minimum 300-400 words)

   ### Chapter 6: Comparative Analysis
   - Structured comparison of alternatives, approaches, or perspectives.
   - Include specific criteria, pros/cons, and evidence-based recommendations.
   - Draw from Analysis Agent's comparison and patterns.
   (Minimum 250-350 words)

   ### Chapter 7: Risk Assessment & Caveats
   - Critical risks, limitations, and edge cases.
   - What could go wrong? What are the unknowns?
   - Mitigation strategies and contingency recommendations.
   - Draw from Fact-Check warnings and Analysis Agent caveats.
   (Minimum 250-350 words)

   ### Chapter 8: Future Outlook & Strategic Roadmap
   - Where is this heading? What are the key indicators to watch?
   - Short-term (0-6 months), medium-term (6-18 months), long-term (18+ months) projections.
   - Strategic recommendations for different stakeholder groups.
   (Minimum 250-350 words)

4. **comparison** (string, MINIMUM 400-600 words):
   A detailed comparative analysis. Can use:
   - Markdown tables for structured comparison matrices
   - Pros/cons lists for each alternative
   - Scoring frameworks with clear criteria
   - Evidence-based recommendations on which option to choose under different circumstances

5. **expert_insights** (array of strings, MINIMUM 8-12 items):
   Cross-agent synthesis insights — these are YOUR original analytical contributions that emerge from combining insights across multiple agent outputs.
   Format: "**[Insight Title]**: [3-4 sentence explanation. Show how you synthesized information from multiple agents to arrive at this insight. Reference specific agent findings.]"

6. **conclusion** (string, MINIMUM 400-600 words):
   The final section — must be comprehensive and actionable.

   ### Summary of Key Findings
   - Restate the 5-7 most important findings in condensed form.

   ### Actionable Recommendations
   - Prioritized list of 5-8 specific recommendations.
   - Each with: **[Priority: Critical/High/Medium]** label, specific action, expected outcome, timeline.

   ### Areas for Further Research
   - What questions remain unanswered?
   - What additional investigation would strengthen these findings?

   ### Final Assessment
   - The definitive conclusion in 2-3 sentences.

7. **fact_check_summary** (string, 200-400 words):
   Condensed reliability assessment drawn from the Fact-Check Agent.
   Include: reliability score justification, strongest/weakest evidence areas, key warnings.

8. **reliability_score** (number, 0-100):
   Carry forward from the Fact-Check Agent's assessment, or adjust based on your synthesis.

═══════════════════════════════════════════════════════════════
FORMATTING RULES (CRITICAL FOR READABILITY)
═══════════════════════════════════════════════════════════════

- Use ### for major sections and #### for subsections.
- **Bold** ALL key terms, findings, statistics, names, and important concepts.
- Use bullet points (- ) for lists and multi-part information.
- Use numbered lists (1. 2. 3.) for sequential steps or ranked items.
- Use > blockquotes for particularly important statements or findings.
- Use --- horizontal rules to separate major chapters in the details field.
- Use markdown tables where comparative data is presented.
- Reference sources as [Source N] throughout the text.
- Every chapter must flow logically into the next — use transition sentences.

═══════════════════════════════════════════════════════════════
ABSOLUTE RULES — VIOLATIONS WILL PRODUCE A BAD REPORT
═══════════════════════════════════════════════════════════════

1. NEVER truncate, summarize, or skip any agent's output. USE ALL OF IT.
2. NEVER produce fewer than 2500 words in the details field.
3. NEVER produce fewer than 800 words in the overview field.
4. EVERY insight from EVERY agent must appear SOMEWHERE in your report.
5. Cross-reference agents: "The Analysis Agent identified [X], which is corroborated by the Fact-Check Agent's finding that [Y]."
6. The report must read as ONE COHESIVE DOCUMENT, not a patchwork of agent outputs.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "overview": "string (800-1000 words)",
  "key_insights": ["string (12-18 items)", "..."],
  "details": "string (2500-3500 words, 6-8 chapters)",
  "comparison": "string (400-600 words)",
  "expert_insights": ["string (8-12 items)", "..."],
  "conclusion": "string (400-600 words)",
  "fact_check_summary": "string (200-400 words)",
  "reliability_score": 0-100
}`;

interface AllAgentOutputs {
  query: string;
  enhanced_query: string;
  queryOutput: Record<string, unknown>;
  searchOutput: Record<string, unknown>;
  analysisOutput: Record<string, unknown>;
  summaryOutput: Record<string, unknown>;
  factCheckOutput: Record<string, unknown>;
  codingOutput: Record<string, unknown>;
  sources: ResearchSource[];
}

export async function runReportAgent(
  context: AgentContext,
  allOutputs: AllAgentOutputs,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("report", context.query);

  const agentSummary = `
═══════════════════════════════════════════════════
AGENT 1: QUERY INTELLIGENCE OUTPUT
═══════════════════════════════════════════════════
Enhanced Query: ${String(allOutputs.enhanced_query)}
Intent: ${String(allOutputs.queryOutput.intent ?? context.intent)}
Subtopics: ${JSON.stringify(allOutputs.queryOutput.subtopics ?? [])}
Key Concepts: ${JSON.stringify(allOutputs.queryOutput.key_concepts ?? [])}
Search Terms: ${JSON.stringify(allOutputs.queryOutput.search_terms ?? [])}

═══════════════════════════════════════════════════
AGENT 2: EXECUTIVE SUMMARY OUTPUT
═══════════════════════════════════════════════════
Overview: ${String(allOutputs.summaryOutput.overview ?? "")}
Key Points: ${JSON.stringify(allOutputs.summaryOutput.key_points ?? [])}
Quick Facts: ${JSON.stringify(allOutputs.summaryOutput.quick_facts ?? [])}
Action Items: ${JSON.stringify(allOutputs.summaryOutput.action_items ?? [])}

═══════════════════════════════════════════════════
AGENT 3: DEEP ANALYSIS OUTPUT (FULL — DO NOT TRUNCATE)
═══════════════════════════════════════════════════
Analysis: ${String(allOutputs.analysisOutput.analysis ?? "")}
Patterns: ${JSON.stringify(allOutputs.analysisOutput.patterns ?? [])}
Comparison: ${String(allOutputs.analysisOutput.comparison ?? "")}
Confidence: ${String(allOutputs.analysisOutput.confidence ?? "")}
Caveats: ${JSON.stringify(allOutputs.analysisOutput.caveats ?? [])}

═══════════════════════════════════════════════════
AGENT 4: FACT-CHECK OUTPUT (FULL — DO NOT TRUNCATE)
═══════════════════════════════════════════════════
Reliability: ${String(allOutputs.factCheckOutput.reliability_label ?? "Unknown")} (${String(allOutputs.factCheckOutput.reliability_score ?? 0)}%)
Fact-Check Summary: ${String(allOutputs.factCheckOutput.fact_check_summary ?? "")}
Verified Claims: ${JSON.stringify(allOutputs.factCheckOutput.verified_claims ?? [])}
Unverified Claims: ${JSON.stringify(allOutputs.factCheckOutput.unverified_claims ?? [])}
Contradictions: ${JSON.stringify(allOutputs.factCheckOutput.contradictions ?? [])}
Warnings: ${JSON.stringify(allOutputs.factCheckOutput.warnings ?? [])}

${Object.keys(allOutputs.codingOutput).length > 0 && allOutputs.codingOutput.code
  ? `═══════════════════════════════════════════════════
AGENT 5: CODING OUTPUT (FULL — DO NOT TRUNCATE)
═══════════════════════════════════════════════════
Language: ${String(allOutputs.codingOutput.language ?? "")}
Code: ${String(allOutputs.codingOutput.code ?? "")}
Explanation: ${String(allOutputs.codingOutput.explanation ?? "")}
Usage Example: ${String(allOutputs.codingOutput.usage_example ?? "")}
Pitfalls: ${JSON.stringify(allOutputs.codingOutput.pitfalls ?? [])}
Alternatives: ${String(allOutputs.codingOutput.alternatives ?? "")}`
  : ""}

═══════════════════════════════════════════════════
WEB SOURCES (${allOutputs.sources.length} found)
═══════════════════════════════════════════════════
${allOutputs.sources.slice(0, 8).map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`).join("\n")}

${context.file_context.length > 0
  ? `═══════════════════════════════════════════════════\nFILE CONTEXT (${context.file_context.length} attached)\n═══════════════════════════════════════════════════\n${context.file_context.slice(0, 10).map(f => `[File: ${f.fileName}]\n${f.content.slice(0, 15000)}`).join("\n\n")}`
  : ""}

${context.conversationHistory && context.conversationHistory.length > 0
  ? `═══════════════════════════════════════════════════\nPREVIOUS CONVERSATION HISTORY\n═══════════════════════════════════════════════════\n${context.conversationHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}`
  : ""}
`.trim();

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `ORIGINAL USER QUERY: ${context.query}

═══════════════════════════════════════════════════════════════
COMPLETE AGENT OUTPUTS — SYNTHESIZE ALL OF THE FOLLOWING
═══════════════════════════════════════════════════════════════

${agentSummary}

═══════════════════════════════════════════════════════════════
SYNTHESIS INSTRUCTIONS (READ CAREFULLY)
═══════════════════════════════════════════════════════════════

You must now produce a COMPLETE research report by weaving together ALL of the agent outputs above.

MANDATORY WORD COUNTS (the report will be rejected if these are not met):
- "overview": 800-1000 words (4 sections with ### headers)
- "details": 2500-3500 words (6-8 chapters with ### headers, this is the MAIN BODY)
- "comparison": 400-600 words (structured comparison with tables or lists)
- "conclusion": 400-600 words (findings summary + recommendations + next steps)
- "key_insights": 12-18 items (each 3-4 sentences, sourced to specific agents)
- "expert_insights": 8-12 items (YOUR synthesis across multiple agents)

SYNTHESIS CHECKLIST — every item MUST appear in your report:
□ All subtopics from Query Intelligence Agent
□ All key_points and quick_facts from Summary Agent
□ The full analysis, ALL patterns, and ALL caveats from Analysis Agent
□ ALL verified_claims, unverified_claims, contradictions, and warnings from Fact-Check Agent
□ The reliability_score and fact_check_summary from Fact-Check Agent
□ Code, explanation, and pitfalls from Coding Agent (if present)

FORMAT: Use ### headers, **bold** key terms, bullet points, numbered lists, and --- separators.
Cross-reference agents: "The Analysis Agent found X, corroborated by Fact-Check Agent's verification of Y."

Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "report-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.reportMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "report-agent",
      output: parsed ?? {
        overview: "",
        key_insights: [],
        details: result.content,
        comparison: "",
        expert_insights: [],
        conclusion: "",
        fact_check_summary: "",
        reliability_score: 0,
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "report-agent",
      output: {
        overview: context.query,
        key_insights: [],
        details: "",
        comparison: "",
        expert_insights: [],
        conclusion: "",
        fact_check_summary: "",
        reliability_score: 0,
      },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Report agent failed",
    };
  }
}
