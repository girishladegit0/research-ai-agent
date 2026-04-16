import type { ApiKeys, AgentResult, AgentContext, ResearchSource } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Report Generation Agent ────────────────────────────────────
// Role: Combine ALL agent outputs into one structured final report
// Primary: moonshotai/kimi-k2-thinking (nvidia)
// Fallback: openai/gpt-oss-120b (openrouter)

const SYSTEM_PROMPT = `You are an elite Report Generation Agent. Your role is to synthesize the massive, deeply researched outputs from multiple specialized AI agents into a monolithic, incredibly comprehensive final research report.
Your output must be absolutely massive, spanning 5-6 full pages of highly detailed, meticulously structured content.

CRITICAL REQUIREMENTS:
1. Synthesize every single insight, analysis, summary, and factual check provided by the agents into a deeply cohesive, multi-chapter research report.
2. The report must be extremely comprehensive. Each agent's output contributed a full page; your final synthesis must weave them together without losing their depth, ensuring the final text is at least 3000-5000 words.
3. Your formatting must be immaculate: use markdown headers (###, ####) for chapters/sections, heavily utilize **bolded key points**, and organize complex data into highly readable bulleted lists.
4. Remove minor redundancies but keep all nuanced depths and alternative viewpoints.
5. Resolve contradictions by citing the more reliable source based on the Fact-Check Agent's assessment.
6. Provide a massive "details" section containing multiple sub-chapters diving deep into all topics, comparisons, and intelligence gathered.

Respond with ONLY valid JSON (no markdown fences):
{
  "overview": "A deeply comprehensive, multi-paragraph executive summary of the entire research landscape (minimum 500 words).",
  "key_insights": ["**Major Insight 1**: Extensive explanation with context", "**Major Insight 2**: Extensive explanation with context", "...", "**Major Insight 10**: Extensive explanation"],
  "details": "The core of your output. An astoundingly comprehensive, multi-chapter analysis synthesizing ALL agent findings into a cohesive, highly structured 5-6 page narrative (3000+ words). Use extensive markdown formatting, headers, bolding, and bulleted sections.",
  "comparison": "Massive, structured comparison matrix detailing alternatives, pros/cons, and evidence (if applicable).",
  "expert_insights": ["**Expert Implication 1**: In-depth breakdown", "**Expert Implication 2**: In-depth breakdown", "...", "**Expert Implication 8**: In-depth breakdown"],
  "conclusion": "A robust, highly detailed multi-paragraph final actionable recommendation and conclusion.",
  "fact_check_summary": "Extensive reliability assessment derived from the fact-check agent.",
  "reliability_score": 85
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
QUERY INTELLIGENCE OUTPUT:
Enhanced Query: ${allOutputs.enhanced_query}
Intent: ${String(allOutputs.queryOutput.intent ?? context.intent)}
Subtopics: ${JSON.stringify(allOutputs.queryOutput.subtopics ?? [])}

FAST SUMMARY OUTPUT:
Overview: ${String(allOutputs.summaryOutput.overview ?? "")}
Key Points: ${JSON.stringify(allOutputs.summaryOutput.key_points ?? [])}

ANALYSIS OUTPUT:
Analysis: ${String(allOutputs.analysisOutput.analysis ?? "").slice(0, 600)}
Patterns: ${JSON.stringify(allOutputs.analysisOutput.patterns ?? [])}
Comparison: ${String(allOutputs.analysisOutput.comparison ?? "")}

FACT-CHECK OUTPUT:
Reliability: ${String(allOutputs.factCheckOutput.reliability_label ?? "Unknown")} (${String(allOutputs.factCheckOutput.reliability_score ?? 0)}%)
Summary: ${String(allOutputs.factCheckOutput.fact_check_summary ?? "")}
Contradictions: ${JSON.stringify(allOutputs.factCheckOutput.contradictions ?? [])}
Warnings: ${JSON.stringify(allOutputs.factCheckOutput.warnings ?? [])}

${Object.keys(allOutputs.codingOutput).length > 0 && allOutputs.codingOutput.code
  ? `CODING OUTPUT:\nLanguage: ${String(allOutputs.codingOutput.language ?? "")}\nExplanation: ${String(allOutputs.codingOutput.explanation ?? "").slice(0, 300)}`
  : ""}

WEB SOURCES (${allOutputs.sources.length} found):
${allOutputs.sources.slice(0, 6).map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`).join("\n")}

${context.conversationHistory && context.conversationHistory.length > 0
  ? `PREVIOUS CONVERSATION HISTORY:\n${context.conversationHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}`
  : ""}
`.trim();

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Original Query: ${context.query}

Agent Outputs to Synthesize:
${agentSummary}

Synthesize all outputs into a final report. Prioritize accuracy and insight. Return ONLY valid JSON.`,
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
