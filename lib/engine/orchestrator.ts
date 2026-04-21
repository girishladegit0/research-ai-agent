import type {
  ResearchResult,
  ResearchOptions,
  ApiKeys,
  StreamCallback,
  AgentContext,
  AgentResult,
  AgentStatusCallback,
  AgentStatusEvent,
  ResearchSource,
  SearchResult,
  AgentName,
} from "./types";
import { TOKEN_LIMITS, MODE_CONFIG } from "./config";
import { enhanceQuery } from "./query-enhancer";
import { selectModelByUserId, getNextFallback } from "./model-router";
import { buildContext } from "./context-builder";
import { classifyError, userFacingMessage } from "./errors";
import { generateAIResponse } from "./providers";
import { nvidiaComplete } from "./providers/nvidia";
import { openrouterComplete } from "./providers/openrouter";

// ── Agent imports ──────────────────────────────────────────────
import { runWebSearchAgent } from "./agents/web-search-agent";
import { runQueryIntelligenceAgent } from "./agents/query-intelligence-agent";
import { runAnalysisAgent } from "./agents/analysis-agent";
import { runCodingAgent } from "./agents/coding-agent";
import { runSummaryAgent } from "./agents/summary-agent";
import { runFactCheckAgent } from "./agents/fact-check-agent";
import { runReportAgent } from "./agents/report-agent";

// ── Helper ─────────────────────────────────────────────────────

function searchResultToSource(r: SearchResult, i: number): ResearchSource {
  return {
    id: String(i + 1),
    title: r.title,
    snippet: r.snippet,
    url: r.url,
    domain: r.domain,
  };
}

// ── Simple Chat (direct response, no agents) ───────────────────
// Used for greetings, simple questions, quick answers.
// Primary: NVIDIA Dracarys 70B | Fallback: OpenRouter Llama 3.3 70B Free

const CHAT_SYSTEM = `# 🧠 IDENTITY & BRAND REPRESENTATION (CRITICAL)

You are **ResAgent**, an advanced multi-agent AI research system built to help users perform deep, structured, and intelligent research.

---

# 🚀 ABOUT RESAGENT

ResAgent is NOT a simple chatbot. It is a multi-agent AI research engine capable of combining real-time web search, AI reasoning, and document analysis to generate structured, high-quality research reports.

Core capabilities:
- Deep research & analysis
- Multi-model AI reasoning (NVIDIA + OpenRouter)
- File-aware intelligence (PDF, docs, etc.)
- Structured report generation (like professional research tools)

---

# 📚 RESAGENT KNOWLEDGE BASE (FACTS)

Use the following facts to answer questions about the creator, the company, and the system accurately. 
IMPORTANT: When providing links, ALWAYS use the [Link Text](URL) markdown format. Do NOT use JSON.

- **Who is Girish Lade?**: Girish Lade is a UI/UX Developer, AI Engineer, and entrepreneur based in India. He is the founder of Lade Stack and specializes in building AI-powered SaaS tools, developer platforms, and intelligent systems. His work focuses on combining design thinking with advanced AI capabilities to create practical, scalable, and user-centric products.

- **What is Lade Stack?**: Lade Stack is a technology-focused brand and product studio founded by Girish Lade. It is dedicated to building innovative AI-driven tools, developer platforms, and productivity systems. The vision of Lade Stack is to empower developers and creators by providing intelligent, accessible, and scalable digital solutions.

- **What is ResAgent?**: ResAgent is an advanced AI research engine designed to go beyond traditional chat-based assistants. It uses a multi-agent architecture, combining web search, AI reasoning, and document analysis to generate structured, high-quality research outputs.

- **What is the vision of ResAgent?**: The vision of ResAgent is to transform how people interact with AI — moving from simple question-answering systems to deep, structured research workflows. It aims to become a reliable research companion for developers, students, and professionals.

- **How is ResAgent different from a typical AI chatbot?**: Unlike standard chatbots, ResAgent uses multiple specialized AI agents working in parallel. Each agent handles a specific task such as web search, analysis, summarization, and fact-checking. This results in more accurate, structured, and insightful outputs.

- **What technologies power ResAgent?**: ResAgent is built using modern web and AI technologies including Next.js, TypeScript, NVIDIA AI endpoints, OpenRouter, Perplexity Sonar for real-time web search, and a Multi-agent orchestration architecture.

- **What AI models are used in ResAgent?**: ResAgent integrates multiple AI models and dynamically selects the best one based on the task, including reasoning models (Kimi, DeepSeek), coding models (Qwen Coder), and balanced models (Llama, Mistral) via NVIDIA and OpenRouter.

- **What is the multi-agent system in ResAgent?**: The multi-agent system is a core feature where different AI agents (search, analysis, summarization, validation) operate simultaneously. Their outputs are then combined into a single, well-structured research report.

- **Can ResAgent analyze user-uploaded files?**: Yes. ResAgent supports file-aware research. Users can upload documents such as PDFs, text files, or spreadsheets to enhance accuracy and personalization.

- **What kind of tasks can ResAgent handle?**: Deep research, technical explanations, coding help, market/product research, document summarization, and comparative analysis.

- **What other products are being built under Lade Stack?**: AI-powered code editors, cloud-based file sharing, API testing tools, document writing platforms, and AI-assisted workspace tools.

- **What is the long-term goal of Lade Stack?**: To build a comprehensive ecosystem of AI-powered tools that enhance productivity, creativity, and development workflows for everyone.

- **Who is ResAgent built for?**: Developers, students, researchers, founders, and anyone who needs structured, high-quality insights.

- **How can users stay connected with Girish Lade and Lade Stack?**: Use these links to reach out:

  - **Instagram**: [https://www.instagram.com/girish_lade_/](https://www.instagram.com/girish_lade_/)
  - **LinkedIn**: [https://www.linkedin.com/in/girish-lade-075bba201/](https://www.linkedin.com/in/girish-lade-075bba201/)
  - **GitHub**: [https://github.com/girishlade111](https://github.com/girishlade111)
  - **CodePen**: [https://codepen.io/Girish-Lade-the-looper](https://codepen.io/Girish-Lade-the-looper)
  - **Website**: [https://ladestack.in](https://ladestack.in)
  - **Email**: [admin@ladestack.in](mailto:admin@ladestack.in)

  *Note: Always present these as a clean, vertical list. Each link on its own line.*

- **What makes ResAgent unique?**: Its combination of multi-agent architecture, intelligent model routing, structured output generation, and deep research capabilities.

---

# 🎯 HOW TO RESPOND TO IDENTITY QUESTIONS

If the user asks about identity, the creator, or the app, you MUST respond in a clear, confident, and branded way using the facts above.
Respond naturally in plain text/markdown. NEVER output JSON for identity questions.

# 🧾 RESPONSE STYLE

1. Introduce yourself as ResAgent.
2. Explain what you do (research-focused system).
3. Mention key capabilities briefly.
4. Mention the creator (Girish Lade, Lade Stack).
5. Tone: Professional, friendly, and confident.

# ⚠️ IMPORTANT RULES
- NEVER give generic answers like "I'm just a chatbot".
- ALWAYS represent ResAgent as a research system.
- ALWAYS include creator info when relevant.
- Keep answers concise but informative.

# 🚀 BRAND GOAL
Reinforce intelligence, capability, professionalism, and trust. You are **ResAgent — a research engine built for serious work.**`;

export async function runSimpleChat(
  query: string,
  apiKeys: ApiKeys,
  onChunk?: StreamCallback
): Promise<ResearchResult> {
  const startTime = Date.now();
  let modelUsed = "abacusai/dracarys-llama-3.1-70b-instruct";
  let providerUsed: "nvidia" | "openrouter" = "nvidia";
  let isFallback = false;
  let content = "";

  const messages = [
    { role: "system" as const, content: CHAT_SYSTEM },
    { role: "user" as const, content: query },
  ];

  // Try NVIDIA first
  if (apiKeys.nvidiaKey) {
    try {
      if (onChunk) {
        // Streaming via NVIDIA
        const { nvidiaStream } = await import("./providers/nvidia");
        const res = await nvidiaStream(
          apiKeys.nvidiaKey,
          { model: modelUsed, messages, maxTokens: 512, temperature: 0.7, stream: true },
          onChunk
        );
        content = res.content;
      } else {
        const res = await nvidiaComplete(apiKeys.nvidiaKey, {
          model: modelUsed,
          messages,
          maxTokens: 512,
          temperature: 0.7,
        });
        content = res.content;
      }
    } catch {
      // Fall through to OpenRouter
      isFallback = true;
    }
  }

  // Fallback: OpenRouter Llama 3.3 70B (free)
  if (!content && apiKeys.openrouterKey) {
    try {
      modelUsed = "meta-llama/llama-3.3-70b-instruct:free";
      providerUsed = "openrouter";
      isFallback = true;
      const res = await openrouterComplete(apiKeys.openrouterKey, {
        model: modelUsed,
        messages,
        maxTokens: 512,
        temperature: 0.7,
      });
      content = res.content;
      if (onChunk) {
        // Emit entire content as single chunk for simplicity
        onChunk(content, false);
        onChunk("", true);
      }
    } catch {
      // OpenRouter also failed — will fall through to error below
    }
  }

  if (!content) {
    throw new Error("All providers failed. Please check your API keys or try again.");
  }

  const durationMs = Date.now() - startTime;

  // Wrap plain text response in ResearchResult shape
  return {
    overview: content,
    keyInsights: [],
    details: "",
    comparison: "",
    expertInsights: [],
    conclusion: "",
    sources: [],
    references: [],
    agentResults: [],
    metadata: {
      model: modelUsed,
      provider: providerUsed,
      searchProvider: "nvidia",
      intent: "general",
      tokensUsed: 0,
      durationMs,
      isFallback,
      agentTrace: [],
    },
  };
}

// ── Main Multi-Agent Orchestrator ──────────────────────────────

export async function runResearch(
  query: string,
  options: ResearchOptions,
  apiKeys: ApiKeys,
  onChunk?: StreamCallback,
  onAgentStatus?: AgentStatusCallback
): Promise<ResearchResult> {
  const startTime = Date.now();

  const emit = (event: AgentStatusEvent) => {
    onAgentStatus?.(event);
  };

  const disabled = options.disabledAgents || [];

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Query Intelligence (First)
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "query-intelligence-agent", status: "running", model: "moonshotai/kimi-k2-thinking", provider: "nvidia" });

  const queryResult = await (disabled.includes("query-intelligence-agent")
    ? Promise.resolve({
        agent: "query-intelligence-agent",
        output: { intent: "general" as const, subtopics: [], search_terms: [] },
        model_used: "none",
        provider: "none",
        durationMs: 0,
        isFallback: false,
        error: "skipped",
        enhanced_query: query,
        subtopics: [],
        search_terms: [],
      } as AgentResult & { enhanced_query: string; subtopics: string[]; search_terms: string[] }).then((r) => { emit({ agent: r.agent, status: "skipped" }); return r; })
    : runQueryIntelligenceAgent(query, options.mode, apiKeys).then(r => {
        emit({
          agent: "query-intelligence-agent",
          status: r.error ? "failed" : "done",
          model: r.model_used,
          provider: r.provider,
          durationMs: r.durationMs,
          isFallback: r.isFallback,
          error: r.error,
        });
        return r;
      }));

  const enhancedQuery = (queryResult as any).enhanced_query || queryResult.output?.enhanced_query || query;
  const subtopics = (queryResult as any).subtopics || (queryResult.output?.subtopics as string[]) || [];
  const searchTerms = (queryResult as any).search_terms || (queryResult.output?.search_terms as string[]) || [];

  // ═══════════════════════════════════════════════════════════
  // PHASE 1.5: Web Search (Second, using optimized terms)
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "web-search-agent", status: "running", model: "abacusai/dracarys-llama-3.1-70b-instruct", provider: "nvidia" });

  const searchResult = await ((MODE_CONFIG[options.mode].maxSources > 0 && !disabled.includes("web-search-agent")) ? runWebSearchAgent(
    { query, enhanced_query: enhancedQuery, search_terms: searchTerms },
    options.mode,
    apiKeys
  ).then(r => {
    emit({
      agent: "web-search-agent",
      status: r.error ? "failed" : "done",
      model: r.model_used,
      provider: r.provider,
      durationMs: r.durationMs,
      isFallback: r.isFallback,
      error: r.error,
    });
    return r;
  }) : Promise.resolve({
    agent: "web-search-agent",
    output: { sources: [], summaries: [], raw_results: [] },
    model_used: "none",
    provider: "none",
    durationMs: 0,
    isFallback: false,
    error: disabled.includes("web-search-agent") ? "skipped" : undefined,
  } as AgentResult).then((r) => { 
      if (disabled.includes("web-search-agent")) emit({ agent: r.agent, status: "skipped" }); 
      return r; 
  }));

  // Build shared AgentContext from Phase 1 outputs
  const webResults: SearchResult[] = (searchResult.output.raw_results as SearchResult[]) ?? [];
  const intent = (queryResult.output.intent as ResearchResult["metadata"]["intent"]) ||
    enhanceQuery(query, options.mode).intent;

  const agentContext: AgentContext = {
    query,
    enhanced_query: enhancedQuery,
    intent,
    subtopics,
    search_terms: searchTerms,
    web_results: webResults,
    file_context: options.files || [],
    conversationHistory: options.conversationHistory,
  };

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Analysis + Summary + Coding + Fact-Check (parallel)
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "analysis-agent", status: "running", model: "nvidia/nemotron-3-super-120b-a12b", provider: "nvidia" });
  emit({ agent: "summary-agent", status: "running", model: "minimaxai/minimax-m2.7", provider: "nvidia" });
  emit({ agent: "coding-agent", status: intent === "coding" ? "running" : "skipped", model: "qwen/qwen3-coder-480b-a35b-instruct", provider: "nvidia" });
  emit({ agent: "fact-check-agent", status: "running", model: "mistralai/mistral-large-3-675b-instruct-2512", provider: "nvidia" });

  const skipAgent = (agentName: AgentName, basePromise: Promise<AgentResult>) => {
    if (disabled.includes(agentName)) {
      const skippedR: AgentResult = {
        agent: agentName,
        output: {},
        model_used: "none",
        provider: "none",
        durationMs: 0,
        isFallback: false,
        error: "skipped",
      };
      emit({ agent: agentName, status: "skipped" });
      return Promise.resolve(skippedR);
    }
    return basePromise;
  };

  const [analysisResult, summaryResult, codingResult, factCheckResult] = await Promise.all([
    skipAgent("analysis-agent", runAnalysisAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "analysis-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    })),
    skipAgent("summary-agent", runSummaryAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "summary-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    })),
    skipAgent("coding-agent", runCodingAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "coding-agent",
        status: r.error === "skipped" ? "skipped" : r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    })),
    skipAgent("fact-check-agent", runFactCheckAgent(agentContext, apiKeys).then(r => {
      emit({
        agent: "fact-check-agent",
        status: r.error ? "failed" : "done",
        model: r.model_used,
        provider: r.provider,
        durationMs: r.durationMs,
        isFallback: r.isFallback,
        error: r.error,
      });
      return r;
    })),
  ]);

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Report Agent — Aggregate Everything
  // ═══════════════════════════════════════════════════════════

  emit({ agent: "report-agent", status: "running", model: "moonshotai/kimi-k2-thinking", provider: "nvidia" });

  const sources = webResults.map((r, i) => searchResultToSource(r, i));

  const reportResult = await runReportAgent(
    agentContext,
    {
      query,
      enhanced_query: enhancedQuery,
      queryOutput: queryResult.output,
      searchOutput: searchResult.output,
      analysisOutput: analysisResult.output,
      summaryOutput: summaryResult.output,
      factCheckOutput: factCheckResult.output,
      codingOutput: codingResult.output,
      sources,
    },
    apiKeys
  ).then(r => {
    emit({
      agent: "report-agent",
      status: r.error ? "failed" : "done",
      model: r.model_used,
      provider: r.provider,
      durationMs: r.durationMs,
      isFallback: r.isFallback,
      error: r.error,
    });
    return r;
  });

  const reportOutput = reportResult.output as Record<string, unknown>;

  // ═══════════════════════════════════════════════════════════
  // Build final ResearchResult
  // ═══════════════════════════════════════════════════════════

  const allAgentResults = [
    queryResult,
    searchResult,
    analysisResult,
    summaryResult,
    codingResult,
    factCheckResult,
    reportResult,
  ];

  const agentTrace: AgentStatusEvent[] = allAgentResults.map(r => ({
    agent: r.agent,
    status: r.error === "skipped" ? "skipped" : r.error ? "failed" : "done",
    model: r.model_used,
    provider: r.provider,
    durationMs: r.durationMs,
    isFallback: r.isFallback,
  }));

  // Code section from coding agent
  const codingOutput = codingResult.output as Record<string, unknown>;
  const codeBlock = codingOutput.code
    ? `\`\`\`${String(codingOutput.language ?? "")}\n${String(codingOutput.code)}\n\`\`\`\n\n${String(codingOutput.explanation ?? "")}`
    : undefined;

  // Fact-check summary
  const factOutput = factCheckResult.output as Record<string, unknown>;
  const factCheckSummary = factOutput.fact_check_summary
    ? `**Reliability: ${String(factOutput.reliability_label ?? "Unknown")} (${String(factOutput.reliability_score ?? 0)}%)**\n\n${String(factOutput.fact_check_summary)}\n\n${(factOutput.contradictions as string[] | undefined ?? []).length > 0 ? `⚠️ Contradictions found:\n${(factOutput.contradictions as string[]).map(c => `- ${c}`).join("\n")}` : ""}`
    : undefined;

  const totalDuration = Date.now() - startTime;

  if (onChunk) {
    onChunk("", true);
  }

  return {
    overview: String(reportOutput.overview ?? summaryResult.output.overview ?? ""),
    keyInsights: (reportOutput.key_insights as string[] | undefined) ?? (summaryResult.output.key_points as string[] | undefined) ?? [],
    details: String(reportOutput.details ?? analysisResult.output.analysis ?? ""),
    comparison: String(reportOutput.comparison ?? analysisResult.output.comparison ?? ""),
    expertInsights: (reportOutput.expert_insights as string[] | undefined) ?? [],
    conclusion: String(reportOutput.conclusion ?? ""),
    code: codeBlock,
    factCheck: factCheckSummary,
    sources,
    references: sources,
    agentResults: allAgentResults,
    metadata: {
      model: reportResult.model_used,
      provider: reportResult.provider,
      searchProvider: (searchResult.provider as string) || "nvidia",
      intent,
      tokensUsed: 0,
      durationMs: totalDuration,
      isFallback: reportResult.isFallback,
      agentTrace,
    },
  };
}

// ── Legacy single-model path (kept for non-streaming fallback) ──

const LEGACY_SYSTEM_PROMPT = `You are an advanced AI research agent. Your job is to generate structured, accurate, and insightful research reports.

OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object in this exact structure:
{
  "overview": "A concise 2-3 sentence summary",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "details": "In-depth analysis with supporting evidence.",
  "comparison": "Structured comparison if applicable, empty string otherwise.",
  "expert_insights": ["Non-obvious insight 1", "Practical implication"],
  "conclusion": "Final takeaway with actionable recommendation (1-2 sentences)",
  "reference_notes": ["Brief note on source quality"]
}`;

export async function runResearchLegacy(
  query: string,
  options: ResearchOptions,
  apiKeys: ApiKeys,
  onChunk?: StreamCallback
): Promise<ResearchResult> {
  const startTime = Date.now();
  const enhanced = enhanceQuery(query, options.mode);
  const modelChain = selectModelByUserId(options.userModelId, query);
  let activeModel = modelChain.primary;
  const failedModels = new Set<string>();

  const { buildContext: bc } = await import("./context-builder");
  const { searchWithFallback } = await import("./search-router");
  const { normalizeResponse } = await import("./response-normalizer");

  const { results: searchResults, provider: searchProvider } = await searchWithFallback(
    { query: enhanced.enhanced, mode: options.mode, maxResults: options.maxSources ?? 6 },
    apiKeys
  );

  const context = bc(searchResults, options.files || [], options.maxTokens ?? TOKEN_LIMITS.contextWindow, enhanced.enhanced);

  const system = LEGACY_SYSTEM_PROMPT;
  const user = `Query: ${query}\n\nSources:\n${context.text}\n\nReturn ONLY valid JSON.`;

  let llmResponse = null as Awaited<ReturnType<typeof generateAIResponse>> | null;

  while (true) {
    try {
      llmResponse = await generateAIResponse({
        model: activeModel.id,
        provider: activeModel.provider,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: !!onChunk,
        apiKeys,
        onChunk,
      });
      break;
    } catch (err) {
      const researchErr = classifyError(err, activeModel.provider);
      failedModels.add(activeModel.id);
      if (!researchErr.retryable) throw researchErr;
      const nextModel = getNextFallback(modelChain, failedModels);
      if (!nextModel) throw researchErr;
      activeModel = nextModel;
    }
  }

  return normalizeResponse(llmResponse!.content, searchResults, {
    model: activeModel.id,
    provider: activeModel.provider,
    searchProvider,
    intent: enhanced.intent,
    tokensUsed: llmResponse!.usage.total_tokens || context.estimatedTokens,
    durationMs: Date.now() - startTime,
    isFallback: activeModel.id !== modelChain.primary.id,
  });
}
