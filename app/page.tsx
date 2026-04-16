"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar, MobileMenuButton } from "@/components/layout/sidebar";
import { SearchInput } from "@/components/search/search-input";
import { SearchControls } from "@/components/search/search-controls";
import { ResponseArea } from "@/components/response/response-area";
import { SourcesSection } from "@/components/response/sources-section";
import { ExportButtons } from "@/components/export/export-buttons";
import { AgentStatusPanel, type AgentState } from "@/components/agents/agent-status-panel";
import { useMobile } from "@/hooks/use-mobile";
import { useResearchCache, type HistoryEntry } from "@/hooks/use-cache";
import { toResponseSections, toExportMarkdown } from "@/lib/engine/response-normalizer";
import type { Source } from "@/components/response/source-card";
import type {
  ResearchApiResponse,
  ResearchResult,
  ResponseSection,
  AgentName,
  AgentStatusEvent,
  LLMMessage,
} from "@/lib/engine/types";
import { ParsedFile } from "@/lib/engine/file-parser";

// ── Agent name list ────────────────────────────────────────────

const ALL_AGENTS: AgentName[] = [
  "web-search-agent",
  "query-intelligence-agent",
  "analysis-agent",
  "summary-agent",
  "fact-check-agent",
  "coding-agent",
  "report-agent",
];

// ── Route decision event ───────────────────────────────────────

interface RouteDecision {
  complexity: "simple" | "research";
  reason: string;
}

// ── SSE Stream Reader ──────────────────────────────────────────

async function readStream(
  response: Response,
  callbacks: {
    onStatus: (phase: string, message: string) => void;
    onToken: (text: string) => void;
    onResult: (result: ResearchResult) => void;
    onError: (message: string) => void;
    onDone: () => void;
    onAgentStatus: (event: AgentStatusEvent) => void;
    onRouteDecision: (decision: RouteDecision) => void;
  }
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            switch (currentEvent) {
              case "status":
                callbacks.onStatus(parsed.phase, parsed.message);
                break;
              case "token":
                callbacks.onToken(parsed.text);
                break;
              case "result":
                callbacks.onResult(parsed as ResearchResult);
                break;
              case "error":
                callbacks.onError(parsed.message);
                break;
              case "done":
                callbacks.onDone();
                break;
              case "agent_status":
                callbacks.onAgentStatus(parsed as AgentStatusEvent);
                break;
              case "route_decision":
                callbacks.onRouteDecision(parsed as RouteDecision);
                break;
            }
          } catch {
            // skip malformed JSON
          }
          currentEvent = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Progressive Section Reveal ─────────────────────────────────

function revealSections(
  allSections: ResponseSection[],
  sources: Source[],
  setSections: React.Dispatch<React.SetStateAction<ResponseSection[]>>,
  setSources: React.Dispatch<React.SetStateAction<Source[]>>,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>
) {
  allSections.forEach((section, i) => {
    setTimeout(() => {
      setSections((prev) => [...prev, section]);
      if (i === allSections.length - 1) {
        setIsStreaming(false);
        setSources(sources);
      }
    }, (i + 1) * 150);
  });
}

// ── Initial agent states ───────────────────────────────────────

function initialAgentStates(): Partial<Record<AgentName, AgentState>> {
  return Object.fromEntries(
    ALL_AGENTS.map((n) => [n, { status: "pending" }])
  ) as Partial<Record<AgentName, AgentState>>;
}

// ── Routing badge ──────────────────────────────────────────────

function RoutingBadge({ complexity }: { complexity: "simple" | "research" | null }) {
  if (!complexity) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mb-3 flex items-center gap-2"
    >
      {complexity === "simple" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Direct Response
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Multi-Agent Research
        </span>
      )}
    </motion.div>
  );
}

// ── Component ──────────────────────────────────────────────────

export default function HomePage() {
  const isMobile = useMobile();
  const { getCached, setCached, getHistory, clearHistory } = useResearchCache();

  // ── UI State ─────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"home" | "history">("home");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ── Search State ─────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pro" | "deep" | "corpus">("pro");
  const [selectedModel, setSelectedModel] = useState("balanced-1");

  // ── Response State ───────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [hasResponse, setHasResponse] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sections, setSections] = useState<ResponseSection[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [fullResult, setFullResult] = useState<ResearchResult | null>(null);
  const [conversationHistory, setConversationHistory] = useState<LLMMessage[]>([]);
  const [disabledAgents, setDisabledAgents] = useState<AgentName[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ── Routing State ─────────────────────────────────────────────
  const [routeComplexity, setRouteComplexity] = useState<"simple" | "research" | null>(null);

  // ── Agent Status State ────────────────────────────────────────
  const [agentStatuses, setAgentStatuses] = useState<Partial<Record<AgentName, AgentState>>>(
    initialAgentStates()
  );
  const [showAgentPanel, setShowAgentPanel] = useState(false);

  // ── Load History on Mount ────────────────────────────────────
  useEffect(() => {
    setHistory(getHistory());
  }, [getHistory]);

  // ── New Thread Handler ───────────────────────────────────────
  const handleNewThread = useCallback(() => {
    abortRef.current?.abort();
    setQuery("");
    setIsLoading(false);
    setHasResponse(false);
    setIsStreaming(false);
    setSections([]);
    setSources([]);
    setError(null);
    setStatusMessage(null);
    setStreamingText("");
    setFullResult(null);
    setAgentStatuses(initialAgentStates());
    setShowAgentPanel(false);
    setRouteComplexity(null);
    setConversationHistory([]);
    setSidebarView("home");
  }, []);

  const handleSelectHistory = useCallback((historyQuery: string, historyMode: string) => {
    setQuery(historyQuery);
    setMode(historyMode as "pro" | "deep" | "corpus");
    setConversationHistory([]);
    setSidebarView("home");
  }, []);

  const handleToggleAgent = useCallback((agent: AgentName) => {
    setDisabledAgents(prev => 
      prev.includes(agent) ? prev.filter(a => a !== agent) : [...prev, agent]
    );
  }, []);

  // ── Clear History Handler ────────────────────────────────────
  const handleClearHistory = useCallback(() => {
    clearHistory();
    setHistory([]);
  }, [clearHistory]);

  // ── Agent Status Update Handler ──────────────────────────────
  const handleAgentStatus = useCallback((event: AgentStatusEvent) => {
    setAgentStatuses((prev) => ({
      ...prev,
      [event.agent]: {
        status: event.status,
        model: event.model,
        provider: event.provider,
        durationMs: event.durationMs,
        isFallback: event.isFallback,
        error: event.error,
      },
    }));
  }, []);

  // ── Submit Handler ───────────────────────────────────────────
  const handleSubmit = useCallback(async (files: ParsedFile[] = []) => {
    if (!query.trim() || isLoading) return;

    // ── Check Cache First ──────────────────────────────────────
    const cached = getCached(query, mode, selectedModel);
    if (cached && files.length === 0) {
      const allSections = toResponseSections(cached);
      setFullResult(cached);
      setHasResponse(true);
      setIsStreaming(true);
      setError(null);
      setStatusMessage(null);
      setSections([]);
      setSources([]);
      setShowAgentPanel(false);
      setRouteComplexity(cached.agentResults && cached.agentResults.length > 0 ? "research" : "simple");

      if (cached.metadata.agentTrace) {
        const restored = Object.fromEntries(
          cached.metadata.agentTrace.map((t) => [
            t.agent,
            {
              status: t.status,
              model: t.model,
              provider: t.provider,
              durationMs: t.durationMs,
              isFallback: t.isFallback,
            } satisfies AgentState,
          ])
        ) as Partial<Record<AgentName, AgentState>>;
        setAgentStatuses(restored);
      }
      revealSections(allSections, cached.sources, setSections, setSources, setIsStreaming);
      setHistory(getHistory());
      return;
    }

    // ── Abort Previous Request ─────────────────────────────────
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsLoading(true);
    setHasResponse(false);
    setIsStreaming(false);
    setSections([]);
    setSources([]);
    setError(null);
    setStatusMessage("Analyzing your query...");
    setStreamingText("");
    setFullResult(null);
    setAgentStatuses(initialAgentStates());
    setShowAgentPanel(false);
    setRouteComplexity(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          mode,
          model: selectedModel,
          stream: true,
          files,
          conversationHistory,
          disabledAgents,
        }),
        signal: abort.signal,
      });

      // ── Non-Streaming JSON Response ──────────────────────────
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data: ResearchApiResponse = await res.json();
        const responseData = data.data;
        if (!data.success || !responseData) throw new Error(data.error ?? "Request failed");

        setFullResult(responseData);
        setCached(query, mode, selectedModel, responseData);
        setIsLoading(false);
        setHasResponse(true);
        setIsStreaming(true);
        setStatusMessage(null);
        const allSections = toResponseSections(responseData);
        revealSections(allSections, responseData.sources, setSections, setSources, setIsStreaming);
        setConversationHistory(prev => [
          ...prev,
          { role: "user", content: query.trim() },
          { role: "assistant", content: `${responseData.overview}\n\n${responseData.details || ""}` }
        ]);
        setHistory(getHistory());
        return;
      }

      // ── SSE Streaming Response ───────────────────────────────
      setHasResponse(true);
      setIsStreaming(true);
      setIsLoading(false);

      await readStream(res, {
        onRouteDecision: ({ complexity }) => {
          setRouteComplexity(complexity);
          // Only show agent panel for research queries
          if (complexity === "research") {
            setShowAgentPanel(true);
            setStatusMessage("Launching research agents...");
          } else {
            setShowAgentPanel(false);
            setStatusMessage("Generating response...");
          }
        },
        onStatus: (_phase, message) => {
          if (message) setStatusMessage(message);
        },
        onToken: (text) => {
          setStreamingText((prev) => prev + text);
          setStatusMessage(null);
        },
        onResult: (result) => {
          setStreamingText("");
          setFullResult(result);
          setCached(query, mode, selectedModel, result);

          // For simple responses, display as a plain paragraph
          const allSections = toResponseSections(result);
          setSections(allSections);
          setSources(result.sources);
          setConversationHistory(prev => [
            ...prev,
            { role: "user", content: query.trim() },
            { role: "assistant", content: `${result.overview}\n\n${result.details || ""}` }
          ]);
          setHistory(getHistory());
        },
        onError: (message) => {
          setError(message);
        },
        onDone: () => {
          setIsStreaming(false);
          setStatusMessage(null);
          setShowAgentPanel(false);
        },
        onAgentStatus: handleAgentStatus,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setIsLoading(false);
      setHasResponse(true);
      setIsStreaming(false);
      setStatusMessage(null);
      setShowAgentPanel(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [query, mode, selectedModel, isLoading, getCached, setCached, getHistory, handleAgentStatus]);

  // ── Export Handler ───────────────────────────────────────────
  const handleExport = useCallback(
    (format: "md" | "pdf" | "txt") => {
      if (!fullResult) return;

      const markdown = toExportMarkdown(fullResult);

      const text =
        format === "txt"
          ? markdown
              .replace(/^##\s+/gm, "")
              .replace(/^\d+\.\s+\[([^\]]+)\]\([^)]+\)/gm, "$1")
              .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
              .replace(/^---$/gm, "")
              .replace(/^\*.*\*$/gm, "")
          : markdown;

      const blob = new Blob([text], {
        type: format === "txt" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research-report.${format === "pdf" ? "md" : format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [fullResult]
  );

  // ── Derived flags ─────────────────────────────────────────────
  const showHero = !hasResponse && !isLoading;
  const showMetadata = fullResult && !isStreaming && !error && routeComplexity === "research";
  const isSimpleChat = routeComplexity === "simple";

  return (
    <div className="flex h-full">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
        onNewThread={handleNewThread}
        history={history}
        onSelectHistory={handleSelectHistory}
        onClearHistory={handleClearHistory}
        activeView={sidebarView}
        onViewChange={setSidebarView}
      />

      <main className="flex min-h-dvh flex-1 flex-col">
        {/* Mobile header */}
        <div className="flex items-center px-4 py-3 md:hidden">
          <MobileMenuButton onClick={() => setSidebarOpen(true)} />
        </div>

        {/* Content area — scrollable middle */}
        <div className={`flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 ${isMobile ? "pb-40" : "pb-8"}`}>
          <div className="w-full max-w-3xl">

            {/* Hero */}
            {showHero && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 mt-[12vh] text-center md:mt-[18vh]"
              >
                <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
                  Research <span className="text-gradient">Smarter</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Ask anything — from quick questions to full AI-powered research reports
                </p>
              </motion.div>
            )}

            {(hasResponse || isLoading) && <div className="mt-6 md:mt-10" />}

            {/* Desktop search */}
            {!isMobile && (
              <div className="space-y-3">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                />
                <SearchControls
                  mode={mode}
                  onModeChange={setMode}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  disabledAgents={disabledAgents}
                  onToggleAgent={handleToggleAgent}
                />
              </div>
            )}

            {/* Routing badge */}
            <AnimatePresence>
              {(hasResponse || isLoading) && routeComplexity && (
                <div className="mt-4">
                  <RoutingBadge complexity={routeComplexity} />
                </div>
              )}
            </AnimatePresence>

            {/* Agent Status Panel — only for research queries */}
            <AnimatePresence>
              {showAgentPanel && (isLoading || isStreaming) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mt-2"
                >
                  <AgentStatusPanel agents={agentStatuses} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status message */}
            {statusMessage && !showAgentPanel && (
              <motion.div
                key={statusMessage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                {statusMessage}
              </motion.div>
            )}

            {/* Streaming raw text (chat or intermediate) */}
            {streamingText && sections.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`mt-6 rounded-2xl p-6 ${isSimpleChat ? "glass" : "glass-strong"}`}
              >
                <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                  {streamingText}
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
                </p>
              </motion.div>
            )}

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </motion.div>
            )}

            {/* Simple chat: render overview as plain text, no structured sections */}
            {isSimpleChat && fullResult && !streamingText && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass mt-6 rounded-2xl p-6"
              >
                <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                  {fullResult.overview}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded bg-accent px-1.5 py-0.5">
                    {fullResult.metadata.model.split("/").pop()}
                  </span>
                  {fullResult.metadata.durationMs > 0 && (
                    <span>{(fullResult.metadata.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </motion.div>
            )}

            {/* Research: structured sections */}
            {!isSimpleChat && (
              <ResponseArea
                sections={sections}
                isStreaming={isStreaming && sections.length > 0 && !streamingText}
              />
            )}

            {/* Research metadata bar */}
            {showMetadata && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-3 flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground"
              >
                <span className={`rounded px-1.5 py-0.5 ${fullResult.metadata.isFallback ? "bg-amber-500/20 text-amber-500" : "bg-accent"}`}>
                  {fullResult.metadata.isFallback ? "Fallback: " : "Report: "}
                  {fullResult.metadata.model.split("/").pop()} ({fullResult.metadata.provider.toUpperCase()})
                </span>
                {fullResult.metadata.durationMs > 0 && (
                  <span>{(fullResult.metadata.durationMs / 1000).toFixed(1)}s total</span>
                )}
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                  {fullResult.metadata.intent}
                </span>
                {fullResult.agentResults && fullResult.agentResults.length > 0 && (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                    {fullResult.agentResults.filter(r => !r.error || r.error === "skipped").length}/{fullResult.agentResults.length} agents OK
                  </span>
                )}
              </motion.div>
            )}

            {/* Sources — only for research */}
            {!isSimpleChat && sources.length > 0 && <SourcesSection sources={sources} />}

            {/* Export — only for research */}
            {!isSimpleChat && hasResponse && !isStreaming && sections.length > 0 && !error && (
              <ExportButtons onExport={handleExport} />
            )}
          </div>
        </div>

        {/* Mobile: sticky bottom search bar */}
        {isMobile && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-glass-border bg-background/80 px-4 pb-4 pt-3 backdrop-blur-xl">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
            <div className="mt-2">
              <SearchControls
                mode={mode}
                onModeChange={setMode}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                disabledAgents={disabledAgents}
                onToggleAgent={handleToggleAgent}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
