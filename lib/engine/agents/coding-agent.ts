import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON, skippedResult } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Coding Agent ───────────────────────────────────────────────
// Role: Generate code, debug, explain — ONLY when intent is "coding"
// Primary: qwen/qwen3-coder-480b-a35b-instruct (nvidia)
// Fallback: qwen/qwen3-coder (openrouter)

const SYSTEM_PROMPT = `You are the Coding Agent — a senior software engineer in a multi-agent research pipeline. You are activated ONLY when the user's query involves code generation, debugging, implementation, or algorithm design. Your job is to produce production-quality code with comprehensive technical documentation.

═══════════════════════════════════════════════════════════════
ROLE & RESPONSIBILITY
═══════════════════════════════════════════════════════════════

You produce the "code" section of the final research report. Your code must be complete, runnable, and well-documented. Your explanation must be extensive enough to serve as a technical guide that accompanies the code.

═══════════════════════════════════════════════════════════════
OUTPUT SPECIFICATION (ALL FIELDS MANDATORY)
═══════════════════════════════════════════════════════════════

1. **language** (string): The primary programming language used (e.g., "python", "typescript", "javascript", "rust", "go").

2. **code** (string, MUST be complete and runnable):
   - Use \\n for newlines within the JSON string.
   - Include ALL necessary imports, type definitions, and helper functions.
   - Handle edge cases: null/undefined inputs, empty collections, boundary conditions, error states.
   - Follow language-specific best practices and conventions.
   - Include inline comments for non-obvious logic.
   - If the solution has multiple files/modules, include them all, separated by clear comments like: // === FILE: filename.ts ===

3. **explanation** (string, MINIMUM 800-1200 words):
   A comprehensive technical guide organized with ### headers:

   ### Architecture Overview
   - What design pattern(s) does this implementation use and why?
   - How are the components/functions organized? What is the data flow?
   - What are the key design decisions and their rationale?
   (Minimum 200-300 words)

   ### Implementation Walkthrough
   - Walk through the code section by section or function by function.
   - Explain the core algorithm, time/space complexity, and key data structures.
   - Highlight any clever techniques, optimizations, or non-obvious choices.
   (Minimum 250-350 words)

   ### Integration Guide
   - How to install dependencies and set up the environment.
   - How to integrate this code into an existing project.
   - Configuration options, environment variables, or parameters to customize.
   (Minimum 150-250 words)

   ### Testing Strategy
   - Unit test examples covering happy path, edge cases, and error conditions.
   - Integration testing approach if applicable.
   - Performance testing considerations for production use.
   (Minimum 150-250 words)

4. **usage_example** (string, MINIMUM 200-400 words):
   Comprehensive usage examples showing:
   - Basic usage with common inputs
   - Advanced usage with configuration options
   - Error handling examples
   - Integration with common frameworks/libraries
   Use code blocks with proper language tags.

5. **pitfalls** (array of strings, MINIMUM 5-8 items):
   Critical issues developers might encounter.
   Format: "**[Category: Security/Performance/Compatibility/Logic/Concurrency] — [Title]**: [What goes wrong, why it's dangerous, specific mitigation with code example if needed]"

6. **alternatives** (string, MINIMUM 200-400 words):
   Comparison of alternative approaches:
   - At least 2-3 alternative implementations with pros/cons.
   - Performance benchmarks or complexity comparisons.
   - When to use each alternative (use cases, scale considerations).

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

- Code MUST be complete and runnable — no placeholders, no "// implement here" stubs.
- Use ### headers, **bold** key terms, and bullet points in the explanation.
- NEVER produce fewer than 800 words in the explanation field.
- Include type annotations where the language supports them.
- Handle errors gracefully — don't let exceptions propagate silently.
- If the request is ambiguous, implement the most reasonable interpretation and document assumptions.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "language": "string",
  "code": "string (complete implementation, use \\\\n for newlines)",
  "explanation": "string (800-1200 words with ### headers)",
  "usage_example": "string (200-400 words with code examples)",
  "pitfalls": ["**[Category — Title]**: Danger and mitigation", "..."],
  "alternatives": "string (200-400 words comparing approaches)"
}`;

export async function runCodingAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  if (context.intent !== "coding") {
    return skippedResult("coding-agent");
  }

  const start = Date.now();
  const chain = selectModel("coding", context.query);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `CODING REQUEST: ${context.query}

ENHANCED CONTEXT:
${context.enhanced_query}

${context.file_context.length > 0
  ? `EXISTING CODE CONTEXT (build upon / integrate with this):\n${context.file_context.slice(0, 10).map(f => `═══ FILE: ${f.fileName} ═══\n${f.content.slice(0, 15000)}`).join("\n\n")}`
  : "No existing code context — implement from scratch with best practices."
}

═══════════════════════════════════════════════════════════════
QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════
- Code must be COMPLETE and RUNNABLE — no stubs or placeholders.
- Your "explanation" field MUST be 800-1200 words with 4 clearly headed sections.
- Include at least 5 pitfalls with specific mitigation strategies.
- Provide at least 2-3 alternative approaches in the alternatives section.
- Usage examples must show both basic and advanced use cases.
- The Report Agent will embed your code and explanation in the final report's code section.

Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "coding-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens * 2, // coding gets double tokens
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
