export interface ChatMessage {
  role: string;
  content: unknown;
}

export interface UpstreamResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  provider: string;
}

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extra?: Record<string, unknown>;
}

export function provider(): Provider | null {
  if (process.env.UPSTREAM_BASE_URL && process.env.UPSTREAM_API_KEY) {
    return {
      name: "custom",
      baseUrl: process.env.UPSTREAM_BASE_URL,
      apiKey: process.env.UPSTREAM_API_KEY,
      model: process.env.UPSTREAM_MODEL || "openai/gpt-oss-120b",
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.UPSTREAM_MODEL || "openai/gpt-oss-120b",
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.UPSTREAM_MODEL || "gemini-flash-lite-latest",
      extra: { reasoning_effort: "none" },
    };
  }
  return null;
}

export const estimateTokens = (messages: ChatMessage[]) =>
  Math.ceil(
    messages.reduce((s, m) => s + (typeof m.content === "string" ? m.content : JSON.stringify(m.content)).length + 8, 0) /
      3.6,
  );

const LOREM =
  "Shared dedicated capacity lets small teams run large models at enterprise throughput without enterprise minimums. ".split(
    " ",
  );

function mockCompletion(messages: ChatMessage[], maxTokens: number, model: string): UpstreamResult {
  const want = Math.max(1, Math.min(maxTokens, 120 + Math.floor(Math.random() * 400)));
  const words: string[] = [];
  for (let i = 0; i < Math.ceil(want / 1.3); i++) words.push(LOREM[i % LOREM.length]);
  const inputTokens = estimateTokens(messages);
  return {
    ok: true,
    status: 200,
    provider: "mock",
    latencyMs: 40 + want * 4,
    inputTokens,
    outputTokens: want,
    body: {
      id: `chatcmpl-mock-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: `[mock upstream] ${words.join(" ").trim()}` },
          finish_reason: want >= maxTokens ? "length" : "stop",
        },
      ],
      usage: { prompt_tokens: inputTokens, completion_tokens: want, total_tokens: inputTokens + want },
    },
  };
}

export async function complete(
  body: Record<string, unknown>,
  messages: ChatMessage[],
  maxTokens: number,
  room: { model: string; upstreamModel?: string },
): Promise<UpstreamResult> {
  const roomModel = room.model;
  const base = provider();
  if (!base) return mockCompletion(messages, maxTokens, roomModel);
  const p = base.name === "groq" && room.upstreamModel && !process.env.UPSTREAM_MODEL ? { ...base, model: room.upstreamModel } : base;
  if (p.name === "groq" && !p.extra) {
    if (p.model.includes("gpt-oss")) p.extra = { reasoning_effort: "low" };
    else if (p.model.includes("qwen")) p.extra = { reasoning_effort: "none" };
  }

  const started = Date.now();
  const payload: Record<string, unknown> = {
    ...p.extra,
    ...body,
    model: p.model,
    messages,
    max_tokens: maxTokens,
    stream: false,
  };
  delete payload.max_completion_tokens;
  delete payload.stream_options;
  delete payload.metadata;

  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const usage = (json.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
    return {
      ok: res.ok,
      status: res.status,
      body: res.ok ? { ...json, model: roomModel, upstream_model: p.model } : json,
      inputTokens: usage.prompt_tokens ?? (res.ok ? estimateTokens(messages) : 0),
      outputTokens: usage.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
      provider: p.name,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: { error: { message: `Upstream unreachable: ${(err as Error).message}`, type: "upstream_error" } },
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      provider: p.name,
    };
  }
}
