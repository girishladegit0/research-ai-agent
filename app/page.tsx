"use client";

import { useState, useCallback, useRef, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, FileText, Globe, User, Sparkles } from "lucide-react";
import { Sidebar, MobileMenuButton } from "@/components/layout/sidebar";
import { SearchInput } from "@/components/search/search-input";
import { SearchControls } from "@/components/search/search-controls";
import { ResponseArea, renderContent } from "@/components/response/response-area";
import { SourcesSection } from "@/components/response/sources-section";
import { ExportButtons } from "@/components/export/export-buttons";
import { AgentStatusPanel } from "@/components/agents/agent-status-panel";
import { useMobile } from "@/hooks/use-mobile";
import { useResearchCache, type HistoryEntry } from "@/hooks/use-cache";
import { toResponseSections, toExportMarkdown } from "@/lib/engine/response-normalizer";
import type { Source } from "@/components/response/source-card";
import type {
  ResearchApiResponse,
  ResearchResult,
  ResponseSection,
  AgentName,
  AgentState,
  AgentStatusEvent,
  LLMMessage,
  ChatMessage,
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

// ── Helpers ───────────────────────────────────────────────────

let _msgCounter = 0;
function generateId(): string {
  return `${Date.now().toString(36)}-${(++_msgCounter).toString(36)}`;
}

function initialAgentStates(): Partial<Record<AgentName, AgentState>> {
  return Object.fromEntries(
    ALL_AGENTS.map((n) => [n, { status: "pending" as const }])
  ) as Partial<Record<AgentName, AgentState>>;
}

function createAssistantMessage(overrides?: Partial<ChatMessage>): ChatMessage {
  return {
    id: generateId(),
    role: "assistant",
    timestamp: Date.now(),
    sections: [],
    sources: [],
    fullResult: null,
    streamingText: "",
    routeComplexity: null,
    agentStatuses: initialAgentStates(),
    showAgentPanel: false,
    statusMessage: "Analyzing your query...",
    isStreaming: false,
    isLoading: true,
    error: null,
    ...overrides,
  };
}

function toConversationHistory(messages: ChatMessage[]): LLMMessage[] {
  return messages
    .filter(m => m.role === "user" || (m.role === "assistant" && m.fullResult))
    .map(m => {
      if (m.role === "user") {
        return { role: "user" as const, content: m.query ?? "" };
      }
      const result = m.fullResult!;
      return { role: "assistant" as const, content: `${result.overview}\n\n${result.details || ""}` };
    });
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/20 bg-teal-400/8 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-teal-300 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
          Direct Response
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Multi-Agent Research
        </span>
      )}
    </motion.div>
  );
}

// ── Chat Message Bubble ────────────────────────────────────────

const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  onExport,
}: {
  message: ChatMessage;
  onExport: (result: ResearchResult, format: "md" | "pdf" | "txt") => void;
}) {
  // ── User message ──────────────────────────────────────────
  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 md:mt-8 flex justify-end"
      >
        <div className="flex items-start gap-3 max-w-[85%]">
          <div className="glass-card rounded-2xl px-5 py-3 border-shine">
            <p className="text-foreground/90 text-[15px] whitespace-pre-wrap">{message.query}</p>
            {message.files && message.files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-accent/80 border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    {f.fileName}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 mt-1 h-7 w-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Assistant message ─────────────────────────────────────
  const isSimpleChat = message.routeComplexity === "simple";
  const showMetadata = message.fullResult && !message.isStreaming && !message.error && message.routeComplexity === "research";
  const isFinalized = !message.isLoading && !message.isStreaming;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 md:mt-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1 h-7 w-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Routing badge */}
          <AnimatePresence>
            {message.routeComplexity && (
              <div className="mt-1">
                <RoutingBadge complexity={message.routeComplexity} />
              </div>
            )}
          </AnimatePresence>

          {/* Agent Status Panel */}
          <AnimatePresence>
            {message.showAgentPanel && (message.isLoading || message.isStreaming) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-3 glass-card rounded-2xl p-5 border-shine"
              >
                <AgentStatusPanel agents={message.agentStatuses} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status message */}
          {message.statusMessage && !message.showAgentPanel && (
            <motion.div
              key={message.statusMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              {message.statusMessage}
            </motion.div>
          )}

          {/* Streaming raw text */}
          {message.streamingText && message.sections.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`mt-3 rounded-2xl p-6 border-shine ${isSimpleChat ? "glass" : "glass-strong"}`}
            >
              <div className="whitespace-pre-wrap leading-[1.75] text-foreground/90">
                {renderContent(message.streamingText)}
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary rounded-full" />
              </div>
            </motion.div>
          )}

          {/* Error */}
          {message.error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {message.error}
            </motion.div>
          )}

          {/* Simple chat: render overview as plain text */}
          {isSimpleChat && message.fullResult && !message.streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass mt-3 rounded-2xl p-6 border-shine"
            >
              <div className="whitespace-pre-wrap leading-[1.75] text-foreground/90">
                {renderContent(message.fullResult.overview)}
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border/50 pt-3">
                <span className="rounded-md bg-accent px-2 py-0.5 font-mono">
                  {message.fullResult.metadata.model.split("/").pop()}
                </span>
                {message.fullResult.metadata.durationMs > 0 && (
                  <span className="text-muted-foreground/60">{(message.fullResult.metadata.durationMs / 1000).toFixed(1)}s</span>
                )}
              </div>
            </motion.div>
          )}

          {/* Research: structured sections */}
          {!isSimpleChat && (
            <ResponseArea
              sections={message.sections}
              isStreaming={message.isStreaming && message.sections.length > 0 && !message.streamingText}
            />
          )}

          {/* Research metadata bar */}
          {showMetadata && message.fullResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-4 flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground"
            >
              <span className={`rounded-md px-2 py-0.5 font-mono ${message.fullResult.metadata.isFallback ? "bg-secondary/15 text-secondary border border-secondary/20" : "bg-accent border border-border/50"}`}>
                {message.fullResult.metadata.isFallback ? "Fallback: " : "Report: "}
                {message.fullResult.metadata.model.split("/").pop()} ({message.fullResult.metadata.provider.toUpperCase()})
              </span>
              {message.fullResult.metadata.durationMs > 0 && (
                <span className="text-muted-foreground/50">{(message.fullResult.metadata.durationMs / 1000).toFixed(1)}s total</span>
              )}
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary border border-primary/15">
                {message.fullResult.metadata.intent}
              </span>
              {message.fullResult.agentResults && message.fullResult.agentResults.length > 0 && (
                <span className="rounded-md bg-teal-500/10 px-2 py-0.5 text-teal-300 border border-teal-400/15">
                  {message.fullResult.agentResults.filter(r => !r.error || r.error === "skipped").length}/{message.fullResult.agentResults.length} agents OK
                </span>
              )}
            </motion.div>
          )}

          {/* Sources */}
          {!isSimpleChat && message.sources.length > 0 && <SourcesSection sources={message.sources} />}

          {/* Export */}
          {!isSimpleChat && isFinalized && message.sections.length > 0 && !message.error && message.fullResult && (
            <ExportButtons onExport={(format) => onExport(message.fullResult!, format)} />
          )}
        </div>
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  const prev = prevProps.message;
  const next = nextProps.message;
  // If the message is finalized, skip re-renders
  if (!prev.isLoading && !prev.isStreaming && !next.isLoading && !next.isStreaming) {
    return prev.id === next.id;
  }
  return false;
});

// ── Component ──────────────────────────────────────────────────

export default function HomePage() {
  const isMobile = useMobile();
  const { getCached, setCached, getHistory, clearHistory } = useResearchCache();

  // ── UI State ─────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"home" | "history">("home");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // ── Search State ─────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pro" | "deep" | "corpus">("pro");
  const [selectedModel, setSelectedModel] = useState("balanced-1");
  const [disabledAgents, setDisabledAgents] = useState<AgentName[]>([]);

  // ── Chat Messages State ──────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Derived ──────────────────────────────────────────────────
  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const isAnyLoading = lastMessage?.role === "assistant" && (lastMessage.isLoading || lastMessage.isStreaming);
  const showHero = !hasMessages && !isAnyLoading;

  // ── Auto-scroll ──────────────────────────────────────────────
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 150;
      isNearBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ── Load History on Mount ────────────────────────────────────
  useEffect(() => {
    setHistory(getHistory());
  }, [getHistory]);

  // ── Update Last Assistant Message ────────────────────────────
  const updateLastAssistant = useCallback(
    (updater: (msg: ChatMessage) => Partial<ChatMessage>) => {
      setMessages(prev => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = { ...copy[lastIdx], ...updater(copy[lastIdx]) };
        }
        return copy;
      });
    },
    []
  );

  // ── New Thread Handler ───────────────────────────────────────
  const handleNewThread = useCallback(() => {
    abortRef.current?.abort();
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = [];
    setMessages([]);
    setQuery("");
    setSidebarView("home");
  }, []);

  const handleSelectHistory = useCallback((historyQuery: string, historyMode: string) => {
    setMessages([]);
    setQuery(historyQuery);
    setMode(historyMode as "pro" | "deep" | "corpus");
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

  // ── Progressive Section Reveal ───────────────────────────────
  const revealSections = useCallback(
    (allSections: ResponseSection[], sources: Source[]) => {
      revealTimersRef.current.forEach(clearTimeout);
      revealTimersRef.current = [];

      allSections.forEach((section, i) => {
        const timer = setTimeout(() => {
          updateLastAssistant(msg => ({
            sections: [...msg.sections, section],
            ...(i === allSections.length - 1
              ? { isStreaming: false, sources }
              : {}),
          }));
        }, (i + 1) * 150);
        revealTimersRef.current.push(timer);
      });
    },
    [updateLastAssistant]
  );

  // ── Submit Handler ───────────────────────────────────────────
  const handleSubmit = useCallback(async (files: ParsedFile[] = []) => {
    if (!query.trim() || isAnyLoading) return;

    const currentQuery = query.trim();

    // ── Append user message ─────────────────────────────────
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      timestamp: Date.now(),
      query: currentQuery,
      files: files.length > 0 ? files : undefined,
      sections: [],
      sources: [],
      fullResult: null,
      streamingText: "",
      routeComplexity: null,
      agentStatuses: {},
      showAgentPanel: false,
      statusMessage: null,
      isStreaming: false,
      isLoading: false,
      error: null,
    };

    // Build conversation history from current messages BEFORE appending new ones
    const conversationHistory = toConversationHistory(messages);

    // ── Check Cache First ──────────────────────────────────
    const cached = getCached(currentQuery, mode, selectedModel);
    if (cached && files.length === 0) {
      const allSections = toResponseSections(cached);
      const assistantMsg = createAssistantMessage({
        fullResult: cached,
        isLoading: false,
        isStreaming: true,
        statusMessage: null,
        routeComplexity: cached.agentResults && cached.agentResults.length > 0 ? "research" : "simple",
        agentStatuses: cached.metadata.agentTrace
          ? Object.fromEntries(
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
            ) as Partial<Record<AgentName, AgentState>>
          : initialAgentStates(),
      });

      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setQuery("");
      setHistory(getHistory());

      // Progressive reveal
      setTimeout(() => revealSections(allSections, cached.sources), 50);
      return;
    }

    // ── Append assistant placeholder ────────────────────────
    const assistantMsg = createAssistantMessage();
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setQuery("");

    // ── Abort Previous Request ──────────────────────────────
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: currentQuery,
          mode,
          model: selectedModel,
          stream: true,
          files,
          conversationHistory,
          disabledAgents,
        }),
        signal: abort.signal,
      });

      // ── Non-Streaming JSON Response ──────────────────────
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data: ResearchApiResponse = await res.json();
        const responseData = data.data;
        if (!data.success || !responseData) throw new Error(data.error ?? "Request failed");

        const allSections = toResponseSections(responseData);
        setCached(currentQuery, mode, selectedModel, responseData);
        updateLastAssistant(() => ({
          fullResult: responseData,
          isLoading: false,
          isStreaming: true,
          statusMessage: null,
          routeComplexity: responseData.agentResults && responseData.agentResults.length > 0 ? "research" : "simple",
        }));
        revealSections(allSections, responseData.sources);
        setHistory(getHistory());
        return;
      }

      // ── SSE Streaming Response ───────────────────────────
      updateLastAssistant(() => ({
        isLoading: false,
        isStreaming: true,
      }));

      await readStream(res, {
        onRouteDecision: ({ complexity }) => {
          updateLastAssistant(() => ({
            routeComplexity: complexity,
            showAgentPanel: complexity === "research",
            statusMessage: complexity === "research" ? "Launching research agents..." : "Generating response...",
          }));
        },
        onStatus: (_phase, message) => {
          if (message) {
            updateLastAssistant(() => ({ statusMessage: message }));
          }
        },
        onToken: (text) => {
          updateLastAssistant(msg => ({
            streamingText: msg.streamingText + text,
            statusMessage: null,
          }));
        },
        onResult: (result) => {
          const allSections = toResponseSections(result);
          setCached(currentQuery, mode, selectedModel, result);
          updateLastAssistant(() => ({
            streamingText: "",
            fullResult: result,
            sections: allSections,
            sources: result.sources,
          }));
          setHistory(getHistory());
        },
        onError: (message) => {
          updateLastAssistant(() => ({
            error: message,
            isLoading: false,
            isStreaming: false,
          }));
        },
        onDone: () => {
          updateLastAssistant(() => ({
            isStreaming: false,
            isLoading: false,
            statusMessage: null,
            showAgentPanel: false,
          }));
        },
        onAgentStatus: (event: AgentStatusEvent) => {
          updateLastAssistant(msg => ({
            agentStatuses: {
              ...msg.agentStatuses,
              [event.agent]: {
                status: event.status,
                model: event.model,
                provider: event.provider,
                durationMs: event.durationMs,
                isFallback: event.isFallback,
                error: event.error,
              },
            },
          }));
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      updateLastAssistant(() => ({
        isLoading: false,
        isStreaming: false,
        statusMessage: null,
        showAgentPanel: false,
        error: err instanceof Error ? err.message : "Something went wrong",
      }));
    }
  }, [query, mode, selectedModel, isAnyLoading, messages, getCached, setCached, getHistory, disabledAgents, updateLastAssistant, revealSections]);

  // ── Export Handler ───────────────────────────────────────────
  const handleExport = useCallback(
    (result: ResearchResult, format: "md" | "pdf" | "txt") => {
      const markdown = toExportMarkdown(result);

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
    []
  );

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

      <main className="flex min-h-dvh flex-1 flex-col relative">
        <div className="streak-container">
          <div className="streak-1" />
          <div className="streak-2" />
          <div className="streak-3" />
        </div>

        {/* Header with Menu Button */}
        {!sidebarOpen && (
          <div className="flex items-center px-4 py-3 absolute top-0 left-0 z-20">
            <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          </div>
        )}

        {/* Content area — scrollable middle */}
        <div
          ref={scrollContainerRef}
          className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pb-48 md:pb-52"
        >
          <div className="w-full max-w-3xl">
            {hasMessages && <div className="mt-6 md:mt-10" />}

            {/* Chat messages */}
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onExport={handleExport}
              />
            ))}

            {/* Scroll anchor */}
            <div ref={scrollAnchorRef} />
          </div>
        </div>

        {/* Unified sleek floating bottom search bar OR centered hero bar */}
        <div
          className={
            showHero
              ? "absolute inset-0 z-30 flex flex-col items-center md:pt-[22vh] pt-[18vh] pointer-events-none px-4"
              : "absolute inset-x-0 bottom-0 z-30 flex justify-center pb-6 pt-10 pointer-events-none"
          }
        >
          {/* Fading gradient background for text readability only when sticky bottom */}
          {!showHero && (
            <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
          )}

          {/* Hero headline */}
          {showHero && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="text-center mb-8 pointer-events-none"
            >
              <h1 className="mb-4 text-4xl font-heading font-bold tracking-[-0.02em] md:text-5xl leading-[1.1]">
                What do you want to <span className="text-gradient">research?</span>
              </h1>
              <p className="text-base text-muted-foreground md:text-lg max-w-md mx-auto leading-relaxed">
                Powered by deep reasoning and multi-agent coordination.
              </p>
            </motion.div>
          )}

          <motion.div
            layout
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-3xl relative z-10 pointer-events-auto"
          >
            <div className={`rounded-[2rem] p-3 md:p-4 transition-all duration-500 border-shine ${showHero ? "glass-card gold-glow" : "glass-strong"}`}>
              <SearchInput
                value={query}
                onChange={setQuery}
                onSubmit={handleSubmit}
                isLoading={!!isAnyLoading}
              />
              <div className="mt-3 flex justify-between items-center ml-1">
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

            {/* Verified Sources Grid */}
            {showHero && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="mt-12 w-full"
              >
                <h3 className="font-heading text-lg text-foreground mb-6">Verified Sources</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card rounded-xl p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors">
                    <FileText className="w-6 h-6 text-secondary" />
                    <h4 className="font-heading text-lg text-foreground">Attention Is All You Need</h4>
                    <p className="font-sans text-sm text-muted-foreground">Foundational paper introducing the transformer architecture.</p>
                  </div>
                  <div className="glass-card rounded-xl p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors">
                    <Globe className="w-6 h-6 text-primary" />
                    <h4 className="font-heading text-lg text-foreground">Reinforcement Learning</h4>
                    <p className="font-sans text-sm text-muted-foreground">Sutton & Barto&apos;s definitive text on RL and agent coordination.</p>
                  </div>
                  <div className="glass-card rounded-xl p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors">
                    <Database className="w-6 h-6 text-[#D4A853]" />
                    <h4 className="font-heading text-lg text-foreground">Agentic Architectures</h4>
                    <p className="font-sans text-sm text-muted-foreground">Latest survey on orchestrating multi-LLM systems effectively.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
