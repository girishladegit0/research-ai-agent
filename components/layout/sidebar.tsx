"use client";

import {
  Home,
  Library,
  Clock,
  Search,
  GitBranch,
  Plus,
  Sparkles,
  X,
  Menu,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/hooks/use-cache";

const toolItems = [
  { icon: Search, label: "Quick Search" },
  { icon: GitBranch, label: "Citation Graph" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  onNewThread: () => void;
  history: HistoryEntry[];
  onSelectHistory: (query: string, mode: string) => void;
  onClearHistory: () => void;
  activeView: "home" | "history";
  onViewChange: (view: "home" | "history") => void;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Sidebar({
  open,
  onClose,
  isMobile,
  onNewThread,
  history,
  onSelectHistory,
  onClearHistory,
  activeView,
  onViewChange,
}: SidebarProps) {
  const navItems = [
    {
      icon: Home,
      label: "Home",
      active: activeView === "home",
      onClick: () => onViewChange("home"),
    },
    {
      icon: Clock,
      label: "History",
      active: activeView === "history",
      onClick: () => onViewChange("history"),
      badge: history.length || undefined,
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col px-3 py-5">
      {/* Logo */}
      <div className="mb-7 flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-xl font-heading tracking-tight text-foreground">
            Research Agent
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* New Thread */}
      <button
        onClick={() => {
          onNewThread();
          if (isMobile) onClose();
        }}
        className="mb-6 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/15 hover:border-primary/30"
      >
        <Plus className="h-4 w-4" />
        New Thread
      </button>

      {/* Navigation */}
      <nav className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all",
              item.active
                ? "bg-accent border border-border/50 text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.badge && (
              <span className="ml-auto rounded-md bg-primary/12 px-1.5 py-0.5 text-xs font-medium text-primary border border-primary/15">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* History list (always visible below nav) */}
      <div className="mt-5 flex-1 overflow-y-auto">
        {history.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                Recent
              </p>
              <button
                onClick={onClearHistory}
                className="rounded p-1 text-muted-foreground/40 hover:text-destructive transition-colors"
                title="Clear History"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-0.5">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    onSelectHistory(entry.query, entry.mode);
                    if (isMobile) onClose();
                  }}
                  className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-all hover:bg-accent/50 group"
                >
                  <span className="w-full truncate text-xs text-foreground/80 group-hover:text-primary transition-colors">
                    {entry.query}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground/50">
                    {formatTimeAgo(entry.timestamp)} · {entry.mode}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="px-3 py-4 text-xs text-muted-foreground/50 pt-4">
            No history yet. Start researching!
          </p>
        )}
      </div>

      {/* Tools */}
      <div className="border-t border-border/40 pt-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
          Tools
        </p>
        <div className="space-y-1">
          {toolItems.map((item) => (
            <button
              key={item.label}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/70 transition-all hover:bg-accent/50 hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-glass-border bg-sidebar"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 288, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="hidden shrink-0 border-r border-glass-border bg-sidebar md:block overflow-hidden"
        >
          <div className="w-72 h-full">
            {sidebarContent}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
