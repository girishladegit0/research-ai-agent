"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { AgentName, AgentState, AgentStatus } from "@/lib/engine/types";

// ── Agent Display Config ───────────────────────────────────────

const AGENT_CONFIG: Record<
  AgentName,
  { label: string; icon: string; defaultModel: string }
> = {
  "web-search-agent": {
    label: "Web Search",
    icon: "🌐",
    defaultModel: "Dracarys Llama 3.1 70B",
  },
  "query-intelligence-agent": {
    label: "Query Intelligence",
    icon: "🧠",
    defaultModel: "Kimi K2 Thinking",
  },
  "analysis-agent": {
    label: "Deep Analysis",
    icon: "📊",
    defaultModel: "DeepSeek V3.2",
  },
  "coding-agent": {
    label: "Code Generation",
    icon: "💻",
    defaultModel: "Qwen 3 Coder 480B",
  },
  "summary-agent": {
    label: "Fast Summary",
    icon: "⚡",
    defaultModel: "MiniMax M2.7",
  },
  "fact-check-agent": {
    label: "Fact Check",
    icon: "🔍",
    defaultModel: "Mistral Large 3",
  },
  "report-agent": {
    label: "Report Generation",
    icon: "🧾",
    defaultModel: "Kimi K2 Thinking",
  },
};

// ── Types ──────────────────────────────────────────────────────

interface AgentStatusPanelProps {
  agents: Partial<Record<AgentName, AgentState>>;
  className?: string;
}

// ── Status Icon ────────────────────────────────────────────────

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "running") {
    return (
      <motion.div
        className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      />
    );
  }
  if (status === "done") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-500/20"
      >
        <svg className="h-2.5 w-2.5 text-teal-300" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20">
        <svg className="h-2.5 w-2.5 text-red-400" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (status === "skipped") {
    return (
      <div className="h-4 w-4 rounded-full bg-muted-foreground/20" />
    );
  }
  // pending
  return (
    <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
  );
}

// ── Single Agent Row ───────────────────────────────────────────

function AgentRow({
  name,
  state,
}: {
  name: AgentName;
  state: AgentState | undefined;
}) {
  const config = AGENT_CONFIG[name];
  const status = state?.status ?? "pending";
  const model = state?.model?.split("/").pop() ?? config.defaultModel;
  const isFallback = state?.isFallback ?? false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
        status === "running"
          ? "bg-primary/6 border border-primary/15"
          : status === "done"
            ? "bg-teal-500/4 border border-teal-500/10"
            : status === "failed"
              ? "bg-red-500/5 border border-red-500/10"
              : "bg-transparent border border-transparent"
      }`}
    >
      {/* Icon + Status */}
      <div className="flex items-center gap-2 w-[22px] shrink-0">
        <StatusIcon status={status} />
      </div>

      {/* Agent Label */}
      <span className="text-sm shrink-0">
        <span className="mr-1.5">{config.icon}</span>
        <span className={`font-medium ${status === "pending" || status === "skipped" ? "text-muted-foreground" : "text-foreground"}`}>
          {config.label}
        </span>
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Model Badge */}
      <AnimatePresence>
        {status !== "pending" && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5"
          >
            {isFallback && (
              <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                Fallback
              </span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
              status === "done"
                ? "bg-teal-500/10 text-teal-300"
                : status === "running"
                  ? "bg-primary/10 text-primary animate-pulse glow-sm"
                  : status === "skipped"
                    ? "bg-muted text-muted-foreground"
                    : "bg-red-500/10 text-red-400"
            }`}>
              {status === "skipped" ? "skipped" : model}
            </span>
            {status === "done" && state?.durationMs != null && state.durationMs > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {(state.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Panel ──────────────────────────────────────────────────────

const AGENT_ORDER: AgentName[] = [
  "web-search-agent",
  "query-intelligence-agent",
  "analysis-agent",
  "summary-agent",
  "fact-check-agent",
  "coding-agent",
  "report-agent",
];

export function AgentStatusPanel({ agents, className = "" }: AgentStatusPanelProps) {
  const doneCount = AGENT_ORDER.filter(
    (name) => agents[name]?.status === "done" || agents[name]?.status === "skipped"
  ).length;

  const totalActive = AGENT_ORDER.filter(
    (name) => agents[name]?.status !== undefined && agents[name]?.status !== "pending"
  ).length;

  const progressPct = Math.round((doneCount / AGENT_ORDER.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
            Agent Pipeline
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground/50">
          {totalActive > 0 ? `${doneCount}/${AGENT_ORDER.length}` : "..."}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-[3px] w-full overflow-hidden rounded-full bg-border/40">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-secondary"
          initial={{ width: "0%" }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Agent rows */}
      <div className="space-y-0.5">
        {AGENT_ORDER.map((name) => (
          <AgentRow key={name} name={name} state={agents[name]} />
        ))}
      </div>
    </motion.div>
  );
}
