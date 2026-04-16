"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AgentName } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

interface AgentConfig {
  id: AgentName;
  name: string;
  description: string;
  estimatedTime: string;
}

const CONFIGURABLE_AGENTS: AgentConfig[] = [
  {
    id: "web-search-agent",
    name: "Web Search",
    description: "Fetches real-time data from the web based on the query.",
    estimatedTime: "~ 3s"
  },
  {
    id: "query-intelligence-agent",
    name: "Query Intelligence",
    description: "Expands query to detect intent and identify subtopics.",
    estimatedTime: "~ 2s"
  },
  {
    id: "analysis-agent",
    name: "Deep Analysis",
    description: "Compares insights and identifies patterns.",
    estimatedTime: "~ 8s"
  },
  {
    id: "summary-agent",
    name: "Summary",
    description: "Condenses information into key points.",
    estimatedTime: "~ 5s"
  },
  {
    id: "fact-check-agent",
    name: "Fact-Check",
    description: "Cross-references claims against reliable sources.",
    estimatedTime: "~ 4s"
  },
  {
    id: "coding-agent",
    name: "Coding",
    description: "Generates code snippets if the query involves programming.",
    estimatedTime: "~ 5s"
  }
];

interface AgentSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabledAgents: AgentName[];
  onToggleAgent: (agent: AgentName) => void;
}

export function AgentSettingsModal({
  open,
  onOpenChange,
  disabledAgents,
  onToggleAgent
}: AgentSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agent Configuration</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Individually enable or disable specific agents for your research pipeline.
            If all agents below are disabled, your query will map directly to a fast chat response.
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {CONFIGURABLE_AGENTS.map((agent) => {
            const isEnabled = !disabledAgents.includes(agent.id);
            return (
              <div 
                key={agent.id}
                className="flex items-start justify-between space-x-4 rounded-xl border border-glass-border bg-glass-panel p-4"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium leading-none">{agent.name}</h4>
                    <span className="inline-flex items-center rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {agent.estimatedTime}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {agent.description}
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => onToggleAgent(agent.id)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isEnabled ? "bg-primary" : "bg-muted"
                  )}
                  role="switch"
                  aria-checked={isEnabled}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                      isEnabled ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
