import { ensureEngine } from "@/lib/http";
import { db, memberByKey } from "@/lib/store";
import { memberLedger } from "@/lib/ledger";
import { preflight, record, reserve } from "@/lib/metering";
import { complete, type ChatMessage } from "@/lib/upstream";

export const dynamic = "force-dynamic";

const oaiError = (status: number, message: string, code: string, headers: Record<string, string> = {}) =>
  Response.json({ error: { message, type: "copod_error", code } }, { status, headers });

export async function POST(req: Request) {
  ensureEngine();
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const m = key ? memberByKey(key) : undefined;
  if (!m) return oaiError(401, "Invalid CoPod API key", "invalid_api_key");
  const room = db().rooms[m.roomId];

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const messages = body?.messages as ChatMessage[] | undefined;
  if (!body || !Array.isArray(messages) || !messages.length) return oaiError(400, "messages is required", "invalid_request");

  const meta = (body.metadata ?? {}) as Record<string, unknown>;
  const priority =
    (req.headers.get("x-copod-priority") ?? String(meta.priority ?? "")).toLowerCase() === "batch" ? "batch" : "interactive";
  const requested = Number(body.max_tokens ?? body.max_completion_tokens) || undefined;

  const pf = preflight(m, room, messages, requested, priority);
  if (!pf.ok) {
    record(m, room, { reserve: 0, inputTokens: 0, outputTokens: 0, gpuMs: 0, priority, outcome: "rejected", requestedMaxTokens: requested, note: pf.message });
    return oaiError(pf.status, pf.message, pf.code, { "x-copod-remaining-usd": memberLedger(m).available.toFixed(4) });
  }

  reserve(m, pf.reserve);
  const up = await complete(body, messages, pf.grantedMaxTokens, room.model);
  const ev = record(m, room, {
    reserve: pf.reserve,
    inputTokens: up.inputTokens,
    outputTokens: up.outputTokens,
    gpuMs: up.latencyMs,
    priority,
    outcome: !up.ok ? "upstream_error" : pf.capped ? "capped" : "ok",
    requestedMaxTokens: pf.requestedMaxTokens,
    grantedMaxTokens: pf.grantedMaxTokens,
    note: !up.ok ? `upstream ${up.status} (not billed)` : pf.reason,
  });

  const remaining = memberLedger(m).available;
  const headers = {
    "x-copod-cost-usd": ev.cost.toFixed(6),
    "x-copod-remaining-usd": remaining.toFixed(4),
    "x-copod-granted-max-tokens": String(pf.grantedMaxTokens),
    "x-copod-price-per-m": `${room.inputPricePerM}/${room.outputPricePerM}`,
    "x-copod-upstream": up.provider,
  };

  if (!up.ok) {
    const err = (up.body.error ?? {}) as { message?: string };
    return oaiError(up.status >= 500 ? 502 : up.status, `Upstream error (not billed): ${err.message ?? up.status}`, "upstream_error", headers);
  }

  const copod = {
    cost_usd: Number(ev.cost.toFixed(6)),
    remaining_hold_usd: Number(remaining.toFixed(4)),
    price_per_m: { input: room.inputPricePerM, output: room.outputPricePerM },
    max_tokens_requested: pf.requestedMaxTokens,
    max_tokens_granted: pf.grantedMaxTokens,
    guardrail: pf.reason ?? null,
  };

  if (body.stream) {
    const choice = ((up.body.choices as { message?: { content?: string }; finish_reason?: string }[]) ?? [])[0];
    const text = choice?.message?.content ?? "";
    const base = { id: up.body.id, object: "chat.completion.chunk", created: up.body.created, model: room.model };
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        send({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });
        for (let i = 0; i < text.length; i += 48) {
          send({ ...base, choices: [{ index: 0, delta: { content: text.slice(i, i + 48) }, finish_reason: null }] });
        }
        send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: choice?.finish_reason ?? "stop" }], usage: up.body.usage, copod });
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  return Response.json({ ...up.body, copod }, { headers });
}
