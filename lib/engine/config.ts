import type { ResolvedModel } from "./types";

// ── API Endpoints ──────────────────────────────────────────────

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// ── Retry Configuration ────────────────────────────────────────

export const RETRY_CONFIG = {
  maxRetries: 1,        // 1 retry max — fallback handles the rest
  baseDelayMs: 500,     // 500ms initial delay
  maxDelayMs: 2000,     // 2s max — don't burn time on retries
} as const;

// ── Token Limits ───────────────────────────────────────────────

export const TOKEN_LIMITS = {
  contextWindow: 131072,
  maxResponseTokens: 32768,
  agentMaxTokens: 16384,      // per-agent token budget — enough for 1+ full page of detailed JSON output
  reportMaxTokens: 32768,     // report agent gets maximum budget for 5-6 page synthesis
  wordsToTokenRatio: 1.3,
} as const;

// ── Mode Configuration ─────────────────────────────────────────

export const MODE_CONFIG = {
  corpus: {
    maxSources: 0,
    description: "Fast report using pure AI knowledge. No web search.",
  },
  deep: {
    maxSources: 4,
    description: "Moderate web research combined with AI analysis.",
  },
  pro: {
    maxSources: 8,
    description: "Comprehensive deep research using maximum agent capabilities.",
  },
} as const;

// ── Model Registry ─────────────────────────────────────────────
// NVIDIA NIM models (billed per token, high quality)
// OpenRouter models (many free tiers, used as fallbacks)

export const MODEL_REGISTRY: Record<"nvidia" | "openrouter", ResolvedModel[]> = {
  nvidia: [
    // ── Fast / Summary ─────────────────────────────────────
    {
      id: "minimaxai/minimax-m2.7",
      provider: "nvidia",
      type: "fast",
      context_length: 32768,
      cost_priority: 1,
      displayName: "MiniMax M2.7",
    },
    // ── Reasoning / Query + Report ─────────────────────────
    {
      id: "moonshotai/kimi-k2-thinking",
      provider: "nvidia",
      type: "reasoning",
      context_length: 32768,
      cost_priority: 2,
      displayName: "Kimi K2 Thinking",
    },
    // ── Balanced ───────────────────────────────────────────
    {
      id: "abacusai/dracarys-llama-3.1-70b-instruct",
      provider: "nvidia",
      type: "balanced",
      context_length: 32768,
      cost_priority: 2,
      displayName: "Dracarys Llama 3.1 70B",
    },
    // ── Fact-Check ─────────────────────────────────────────
    {
      id: "mistralai/mistral-large-3-675b-instruct-2512",
      provider: "nvidia",
      type: "balanced",
      context_length: 32768,
      cost_priority: 3,
      displayName: "Mistral Large 3",
    },
    // ── Analysis / Deep Research ───────────────────────────
    {
      id: "deepseek-ai/deepseek-v3.2",
      provider: "nvidia",
      type: "reasoning",
      context_length: 32768,
      cost_priority: 3,
      displayName: "DeepSeek V3.2",
    },
    {
      id: "z-ai/glm4.7",
      provider: "nvidia",
      type: "balanced",
      context_length: 32768,
      cost_priority: 2,
      displayName: "GLM 4.7",
    },
    // ── Coding ─────────────────────────────────────────────
    {
      id: "qwen/qwen3-coder-480b-a35b-instruct",
      provider: "nvidia",
      type: "coding",
      context_length: 32768,
      cost_priority: 3,
      displayName: "Qwen 3 Coder 480B",
    },
    // ── New: Nemotron for Analysis fallback ────────────────
    {
      id: "nvidia/nemotron-3-super-120b-a12b",
      provider: "nvidia",
      type: "balanced",
      context_length: 32768,
      cost_priority: 2,
      displayName: "Nemotron 3 Super 120B",
    },
  ],
  openrouter: [
    {
      id: "nvidia/nemotron-3-super-120b-a12b:free",
      provider: "openrouter",
      type: "balanced",
      context_length: 32768,
      cost_priority: 1,
      displayName: "Nemotron 3 Super (Free)",
    },
    {
      id: "qwen/qwen3-coder:free",
      provider: "openrouter",
      type: "coding",
      context_length: 32768,
      cost_priority: 1,
      displayName: "Qwen 3 Coder (Free)",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      provider: "openrouter",
      type: "balanced",
      context_length: 131072,
      cost_priority: 1,
      displayName: "Llama 3.3 70B (Free)",
    },
    {
      id: "openai/gpt-oss-120b:free",
      provider: "openrouter",
      type: "reasoning",
      context_length: 32768,
      cost_priority: 1,
      displayName: "GPT-OSS 120B (Free)",
    },
    {
      id: "z-ai/glm-4.5-air:free",
      provider: "openrouter",
      type: "fast",
      context_length: 32768,
      cost_priority: 1,
      displayName: "GLM 4.5 Air (Free)",
    },
    {
      id: "google/gemma-4-31b-it:free",
      provider: "openrouter",
      type: "fast",
      context_length: 32768,
      cost_priority: 1,
      displayName: "Gemma 4 31B (Free)",
    },
    {
      id: "minimax/minimax-m2.5:free",
      provider: "openrouter",
      type: "fast",
      context_length: 32768,
      cost_priority: 1,
      displayName: "MiniMax M2.5 (Free)",
    },
  ]
};

// ── Task-to-Model Mapping ──────────────────────────────────────
// Primary = NVIDIA NIM | Fallback = OpenRouter (prefer free)

export const AGENT_MODEL_MAP: Record<
  "query" | "search" | "analysis" | "coding" | "summary" | "fact-check" | "report" | "default",
  { primary: string; fallback: string }
> = {
  query: {
    primary: "moonshotai/kimi-k2-thinking",
    fallback: "openai/gpt-oss-120b:free",
  },
  search: {
    primary: "abacusai/dracarys-llama-3.1-70b-instruct",   // NVIDIA NIM search
    fallback: "meta-llama/llama-3.3-70b-instruct:free",     // OpenRouter fallback
  },
  analysis: {
    primary: "nvidia/nemotron-3-super-120b-a12b",
    fallback: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  coding: {
    primary: "qwen/qwen3-coder-480b-a35b-instruct",
    fallback: "qwen/qwen3-coder:free",
  },
  summary: {
    primary: "minimaxai/minimax-m2.7",
    fallback: "google/gemma-4-31b-it:free",
  },
  "fact-check": {
    primary: "mistralai/mistral-large-3-675b-instruct-2512",
    fallback: "meta-llama/llama-3.3-70b-instruct:free",
  },
  report: {
    primary: "moonshotai/kimi-k2-thinking",
    fallback: "openai/gpt-oss-120b:free",
  },
  default: {
    primary: "abacusai/dracarys-llama-3.1-70b-instruct",
    fallback: "meta-llama/llama-3.3-70b-instruct:free",
  },
};

// ── Fallback Builder ───────────────────────────────────────────

export const getFallbackChain = (primary: ResolvedModel): ResolvedModel[] => {
  return MODEL_REGISTRY.openrouter.filter(m => m.type === primary.type && m.id !== primary.id);
};

// ── Lookup helpers ─────────────────────────────────────────────

export function findModel(id: string): ResolvedModel | undefined {
  return [...MODEL_REGISTRY.nvidia, ...MODEL_REGISTRY.openrouter].find(m => m.id === id || m.id === `${id}:free`);
}
