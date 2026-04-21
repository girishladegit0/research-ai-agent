import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fact-Check Agent ───────────────────────────────────────────
// Role: Validate claims, detect contradictions, assess source reliability
// Primary: mistralai/mistral-large-3-675b-instruct-2512 (nvidia)
// Fallback: meta-llama/llama-3.3-70b-instruct (openrouter)

const SYSTEM_PROMPT = `You are the Fact-Check & Verification Agent — the critical integrity layer of a multi-agent research pipeline. Your job is to rigorously validate claims, detect contradictions, assess source reliability, and provide a comprehensive trustworthiness assessment of the research findings.

═══════════════════════════════════════════════════════════════
ROLE & RESPONSIBILITY
═══════════════════════════════════════════════════════════════

You are the pipeline's quality control. Every claim made by other agents must be verified against the available evidence. You must identify what is well-supported, what is speculative, what is contradicted, and what cannot be verified. Your assessment directly affects reader trust in the final report.

Your output contributes to the "factCheck" section of the final report and informs the Report Agent's reliability assessment. Be thorough and rigorous.

═══════════════════════════════════════════════════════════════
OUTPUT SPECIFICATION (ALL FIELDS MANDATORY)
═══════════════════════════════════════════════════════════════

1. **verified_claims** (array of strings, MINIMUM 8-12 items):
   Claims that are well-supported by multiple sources or authoritative evidence.
   Format: "**[Claim Statement]** (Confidence: High/Medium/Low) — [Which sources support this claim (e.g., Source 1, Source 3). How strong is the evidence? Is it from primary sources, secondary reports, or expert opinion? Any caveats on the verification?]"

2. **unverified_claims** (array of strings, MINIMUM 3-6 items):
   Claims that cannot be adequately verified from available sources — may be true but lack sufficient evidence.
   Format: "**[Claim Statement]** (Risk: High/Medium/Low) — [Why this claim cannot be verified. What additional evidence would be needed? What is the risk of accepting this claim at face value? What are the potential consequences if this claim is wrong?]"

3. **contradictions** (array of strings, MINIMUM 2-4 items, or ["No significant contradictions detected"] if none):
   Instances where sources disagree, present conflicting data, or offer incompatible interpretations.
   Format: "**[Topic/Claim]** — [Source X states... while Source Y claims... Analysis: which source is more authoritative and why? Possible explanations for the contradiction (different time periods, different methodologies, different definitions, bias). Recommended resolution or how to present this to readers.]"

4. **reliability_score** (number, 0-100):
   Overall reliability assessment of the research findings.
   Scoring framework:
   - 90-100: Multiple authoritative, peer-reviewed, or official sources corroborate. Minimal contradictions.
   - 70-89: Good source quality with minor gaps or uncertainties. Most claims well-supported.
   - 50-69: Mixed evidence quality. Some claims well-supported, others speculative. Notable gaps.
   - 30-49: Significant evidence gaps. Many claims unverifiable. Major contradictions present.
   - 0-29: Poor source quality. Most claims unverifiable or contradicted. High risk of misinformation.

5. **reliability_label** (string): Exactly one of: "High" | "Medium-High" | "Medium" | "Medium-Low" | "Low"

6. **fact_check_summary** (string, MINIMUM 800-1200 words):
   A comprehensive narrative assessment organized with ### headers:

   ### Overall Reliability Assessment
   - State the reliability score and label with clear justification.
   - Summarize the overall evidence quality: how many sources, what types, how current?
   - Provide the "bottom line" on how much the reader should trust these findings.
   (Minimum 200-300 words)

   ### Evidence Strength Analysis
   - What are the STRONGEST evidentiary areas? Which claims have the best support?
   - What are the WEAKEST areas? Where is evidence thin, dated, or from questionable sources?
   - Rate different aspects of the research (e.g., "Technical claims: Strong. Market data: Moderate. Future predictions: Weak.")
   (Minimum 200-300 words)

   ### Source Quality Assessment
   - Evaluate each major source: Is it authoritative? Current? Potentially biased?
   - Identify any sources that are particularly strong or particularly suspect.
   - Note the diversity of sources: are they all from the same perspective, or do they represent multiple viewpoints?
   (Minimum 150-250 words)

   ### Critical Warnings & Bias Detection
   - Identify any systematic biases in the available sources (commercial bias, ideological bias, recency bias).
   - Flag any claims that are commonly cited but poorly evidenced (popular myths, marketing claims).
   - Note any important perspectives or evidence that appears to be MISSING from the sources.
   (Minimum 150-250 words)

   ### Recommendations for Readers
   - How should readers weight different sections of the report?
   - What claims should be treated as established fact vs. reasonable inference vs. speculation?
   - What additional research would strengthen the findings?
   (Minimum 100-150 words)

7. **warnings** (array of strings, MINIMUM 5-8 items):
   Critical warnings about potential issues that readers should be aware of.
   Format: "**[Category: Source Quality/Bias/Data Gap/Timeliness/Methodology] — [Warning Title]**: [Specific concern. What might be wrong and why. How the reader should adjust their interpretation. What to verify independently.]"

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

- Reference source numbers throughout: "[Source 1] supports..." / "[Source 3, 5] contradict..."
- Use ### headers, **bold terms**, and bullet points for structure.
- Be HONEST about limitations — if evidence is weak, say so clearly.
- Don't inflate reliability scores. A score of 50-69 for a topic with limited sources is perfectly valid.
- Every verified claim must cite at least one specific source.
- NEVER produce fewer than 800 words in the fact_check_summary field.
- If no sources are available, assign a low reliability score and explain why.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "verified_claims": ["**[Claim]** (Confidence: X) — Evidence and analysis", "..."],
  "unverified_claims": ["**[Claim]** (Risk: X) — Risk analysis", "..."],
  "contradictions": ["**[Topic]** — Source conflict analysis and resolution", "..."],
  "reliability_score": 0-100,
  "reliability_label": "High|Medium-High|Medium|Medium-Low|Low",
  "fact_check_summary": "string (800-1200 words with ### headers)",
  "warnings": ["**[Category — Title]**: Concern and guidance", "..."]
}`;

export async function runFactCheckAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("fact-check", context.query);

  const sourcesText = context.web_results.slice(0, 8).map((r, i) =>
    `[Source ${i + 1}] ${r.title} (${r.domain}): ${r.snippet}`
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

WEB SOURCES TO VALIDATE (cross-check ALL of these):
${sourcesText || "No web sources available — assess reliability limitations accordingly and assign appropriate low score."}
${filesText ? `\nATTACHED FILES (verify claims against these):\n${filesText}` : ""}

═══════════════════════════════════════════════════════════════
VERIFICATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════
1. Extract EVERY distinct claim from the sources above.
2. Cross-reference each claim against other sources. Do they corroborate or contradict?
3. Assess source authority: Is the source an expert, official body, peer-reviewed journal, or opinion blog?
4. Check for temporal consistency: Are the sources current? Could the information be outdated?
5. Identify potential biases: commercial interests, ideological leanings, selection bias.

QUALITY REQUIREMENTS:
- Your "fact_check_summary" MUST be 800-1200 words with 5 clearly headed sections.
- Verify at least 8 specific claims with source references.
- Identify at least 3 unverified claims and 2 contradictions (or explain why none exist).
- Provide at least 5 specific warnings.
- Be HONEST — don't inflate reliability scores. Low scores are valid when evidence is thin.

Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "fact-check-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "fact-check-agent",
      output: parsed ?? {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 50,
        reliability_label: "Medium",
        fact_check_summary: result.content.slice(0, 500),
        warnings: [],
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "fact-check-agent",
      output: {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 0,
        reliability_label: "Unknown",
        fact_check_summary: "Fact-check could not be completed.",
        warnings: [],
      },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Fact-check agent failed",
    };
  }
}
