import type {
  LLMResponse,
  LLMRequestOptions,
  StreamCallback,
} from "../types";
import { OPENROUTER_BASE_URL, RETRY_CONFIG } from "../config";
import { ResearchError } from "../errors";

// ── Request Helper ─────────────────────────────────────────────

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://research-agent.app",
    "X-Title": "ResAgent",
  };
}

function buildBody(options: LLMRequestOptions) {
  return {
    model: options.model,
    messages: options.messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    stream: options.stream ?? false,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
}

function handleErrorStatus(status: number): ResearchError {
  if (status === 429)
    return new ResearchError("OpenRouter rate limit exceeded", "rate_limit", {
      provider: "openrouter",
      statusCode: 429,
    });
  if (status === 401 || status === 403)
    return new ResearchError("OpenRouter API key invalid", "auth", {
      provider: "openrouter",
      statusCode: status,
    });
  if (status === 402)
    return new ResearchError("OpenRouter credits exhausted", "rate_limit", {
      provider: "openrouter",
      statusCode: 402,
    });
  return new ResearchError(`OpenRouter API error: ${status}`, "provider_down", {
    provider: "openrouter",
    statusCode: status,
  });
}

// ── Timeout Helper ────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 90_000; // 90 seconds — agents generate large JSON outputs

function makeSignal(timeoutMs?: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

// ── Non-Streaming Completion ───────────────────────────────────

export async function openrouterComplete(
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(buildBody({ ...options, stream: false })),
    signal: makeSignal(options.timeoutMs),
  });

  if (!res.ok) throw handleErrorStatus(res.status);

  const data = await res.json();

  // OpenRouter may return error in body even with 200
  if (data.error) {
    throw new ResearchError(
      `OpenRouter: ${data.error.message ?? data.error}`,
      "provider_down",
      { provider: "openrouter" }
    );
  }

  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content ?? "",
    model_used: data.model ?? options.model,
    provider: "openrouter",
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
    }
  };
}

// ── Streaming Completion ───────────────────────────────────────

export async function openrouterStream(
  apiKey: string,
  options: LLMRequestOptions,
  onChunk: StreamCallback
): Promise<LLMResponse> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(buildBody({ ...options, stream: true })),
    signal: makeSignal(options.timeoutMs ?? 60_000),
  });

  if (!res.ok) throw handleErrorStatus(res.status);
  if (!res.body) throw new ResearchError("No response body for stream", "network", { provider: "openrouter" });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          onChunk("", true);
          break;
        }

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            fullContent += delta;
            onChunk(delta, false);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    model_used: options.model,
    provider: "openrouter",
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

// ── Retry Wrapper ──────────────────────────────────────────────

export async function openrouterWithRetry(
  apiKey: string,
  options: LLMRequestOptions,
  onChunk?: StreamCallback
): Promise<LLMResponse> {
  let lastError: ResearchError | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (options.stream && onChunk) {
        return await openrouterStream(apiKey, options, onChunk);
      }
      return await openrouterComplete(apiKey, options);
    } catch (err) {
      lastError =
        err instanceof ResearchError
          ? err
          : new ResearchError(String(err), "unknown", { provider: "openrouter" });

      if (!lastError.retryable || attempt === RETRY_CONFIG.maxRetries) break;

      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
        RETRY_CONFIG.maxDelayMs
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new ResearchError("OpenRouter: all retries exhausted", "unknown", { provider: "openrouter" });
}
