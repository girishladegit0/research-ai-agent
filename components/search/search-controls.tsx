"use client";

import { SlidersHorizontal, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelector } from "./model-selector";
import { AgentSettingsModal } from "@/components/agents/agent-settings-modal";
import { useState } from "react";
import type { AgentName } from "@/lib/engine/types";

type SearchMode = "pro" | "deep" | "corpus";

interface SearchControlsProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabledAgents: AgentName[];
  onToggleAgent: (agent: AgentName) => void;
}

const modes: { value: SearchMode; label: string }[] = [
  { value: "pro", label: "Pro" },
  { value: "deep", label: "Deep" },
  { value: "corpus", label: "Corpus" },
];

export function SearchControls({
  mode,
  onModeChange,
  selectedModel,
  onModelChange,
  disabledAgents,
  onToggleAgent,
}: SearchControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      {/* Mode toggles */}
      <div className="glass flex rounded-lg p-0.5">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              mode === m.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Model selector */}
      <ModelSelector selected={selectedModel} onSelect={onModelChange} />

      {/* Settings button */}
      <button 
        onClick={() => setSettingsOpen(true)}
        className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground"
      >
        <Settings2 className="h-3 w-3" />
        Settings
      </button>

      <AgentSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        disabledAgents={disabledAgents}
        onToggleAgent={onToggleAgent}
      />
    </div>
  );
}
