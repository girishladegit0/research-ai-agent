import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON, skippedResult } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Coding Agent ───────────────────────────────────────────────
// Role: Generate code, debug, explain — ONLY when intent is "coding"
// Primary: qwen/qwen3-coder-480b-a35b-instruct (nvidia)
// Fallback: qwen/qwen3-coder (openrouter)

const SYSTEM_PROMPT = `You are an elite, senior-level Coding Agent. Your role is to generate highly detailed, production-ready code, comprehensive architectural explanations, and meticulous debugging analysis.
Your output must be extremely comprehensive, spanning at least one full page (800+ words of explanation/docs alongside code) of structured content.

CRITICAL REQUIREMENTS:
1. Generate clean, highly robust, production-ready code for the user's request, covering edge cases.
2. Include extensive architectural comments, inline documentation, and comprehensive module-level explanations.
3. Highlight common pitfalls, anti-patterns, and security best practices with detailed bullet points.
4. Provide multiple usage examples, test cases, or integration scripts.
5. Your textual explanations must be highly structured, using markdown headers (###), bold text for **Key Points**, and organized bullet points for clarity.

Respond with ONLY valid JSON (no markdown fences):
{
  "language": "the primary programming language",
  "code": "the full, extensive code implementation including comments and error handling (use \\n for newlines)",
  "explanation": "Extremely detailed, multi-paragraph step-by-step architectural explanation and documentation. Minimum 800+ words. Use markdown headers and bold bullet points.",
  "usage_example": "Extensive integration script or robust test cases showing how to use the code",
  "pitfalls": ["**Pitfall 1**: In-depth explanation", "**Pitfall 2**: In-depth explanation"],
  "alternatives": "Detailed technical comparison of alternative frameworks/approaches with bulleted pros and cons"
}`;

export async function runCodingAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  // Only run for coding intent
  if (context.intent !== "coding") {
    return skippedResult("coding-agent");
  }

  const start = Date.now();
  const chain = selectModel("coding", context.query);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Coding Request: ${context.query}
Enhanced: ${context.enhanced_query}

${context.file_context.length > 0
  ? `Existing Code Context:\n${context.file_context.map(f => `File: ${f.fileName}\n${f.content.slice(0, 800)}`).join("\n\n")}`
  : "No existing code context."
}

Generate the best implementation. Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "coding-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens * 2, // coding gets more tokens
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "coding-agent",
      output: parsed ?? {
        language: "unknown",
        code: result.content,
        explanation: "",
        usage_example: "",
        pitfalls: [],
        alternatives: "",
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "coding-agent",
      output: { language: "", code: "", explanation: "", pitfalls: [], alternatives: "" },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Coding agent failed",
    };
  }
}
