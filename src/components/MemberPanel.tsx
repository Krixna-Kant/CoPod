"use client";

import { useState } from "react";
import type { RoomView } from "@/lib/view";
import { PayButton } from "./PayButton";
import { loadIdentity, post, saveIdentity, type Identity } from "./useRoom";
import { statusColor, usd } from "./format";

const PROMPTS = [
  "Summarize the trade-offs of renting dedicated H100 capacity versus using a public rate-limited API, in 5 bullet points.",
  "Write a Python function that batches 10,000 documents into chunks of 512 tokens with overlap, with docstring and tests.",
  "Explain PayPal authorization and capture to a junior engineer, with an example of a partial capture.",
];

export function MemberPanel({ view }: { view: RoomView }) {
  const roomId = view.room.id;
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity(roomId));
  const [pending, setPending] = useState<{ memberId: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = identity ? view.members.find((m) => m.id === identity.memberId) : undefined;

  const reset = () => {
    saveIdentity(roomId, null);
    setIdentity(null);
    setPending(null);
  };

  if (!identity) {
    return (
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold">Join this room</h3>
        <p className="mt-1 text-xs text-slate-500">
          Place a refundable {usd(view.room.depositAmount)} PayPal authorization. You only pay for the tokens you use; the rest is
          released when you leave.
        </p>
        {!pending ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              try {
                const r = await post<{ memberId: string }>(`/api/rooms/${roomId}/join`, { name });
                setPending({ memberId: r.memberId, name: name || "Developer" });
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your team or app name"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-copod-500"
            />
            <button disabled={busy} className="rounded-lg bg-copod-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Continue
            </button>
          </form>
        ) : (
          <div className="mt-3">
            <PayButton
              memberId={pending.memberId}
              kind="deposit"
              amount={view.room.depositAmount}
              onAuthorized={(r) => {
                const id = { memberId: pending.memberId, apiKey: r.apiKey, name: pending.name };
                saveIdentity(roomId, id);
                setIdentity(id);
                setPending(null);
              }}
            />
          </div>
        )}
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      </div>
    );
  }

  if (!me) {
    return (
      <div className="glass-card rounded-2xl p-4 text-sm">
        <p className="text-slate-500">Your membership was not found in this room (the server may have been reset).</p>
        <button onClick={reset} className="mt-2 text-copod-600 underline">
          Join again
        </button>
      </div>
    );
  }

  return <Membership view={view} me={me} identity={identity} onReset={reset} />;
}

function Membership({
  view,
  me,
  identity,
  onReset,
}: {
  view: RoomView;
  me: RoomView["members"][number];
  identity: Identity;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ text: string; meta: string; error?: boolean } | null>(null);
  const [priority, setPriority] = useState<"interactive" | "batch">("interactive");
  const [maxTokens, setMaxTokens] = useState(600);
  const [showKey, setShowKey] = useState(false);
  const base = typeof window !== "undefined" ? `${window.location.origin}/v1` : "/v1";

  const send = async () => {
    setBusy("prompt");
    setOut(null);
    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${identity.apiKey}`, "Content-Type": "application/json", "x-copod-priority": priority },
        body: JSON.stringify({
          model: view.room.model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: PROMPTS[Math.floor(Math.random() * PROMPTS.length)] }],
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setOut({ text: j.error?.message ?? "Request failed", meta: `HTTP ${res.status}`, error: true });
      } else {
        const c = j.copod;
        setOut({
          text: j.choices?.[0]?.message?.content ?? "",
          meta: `${j.usage?.prompt_tokens} in / ${j.usage?.completion_tokens} out - cost ${usd(c.cost_usd, 5)} - remaining ${usd(
            c.remaining_hold_usd,
            4,
          )}${c.guardrail ? ` - ${c.guardrail}` : ""}`,
        });
      }
    } catch (e) {
      setOut({ text: (e as Error).message, meta: "network", error: true });
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    if (!confirm("Leave the room? The agent will capture your exact usage and release the rest of your hold.")) return;
    setBusy("leave");
    try {
      await post(`/api/members/${me.id}/leave`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const inject = async (usdAmt: number) => {
    setBusy("inject");
    try {
      await post(`/api/rooms/${view.room.id}/sim`, { action: "inject", memberId: me.id, usd: usdAmt });
    } finally {
      setBusy(null);
    }
  };

  if (me.status === "settled" && me.settlement) {
    const s = me.settlement;
    return (
      <div className="glass-card rounded-2xl space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Settled - {me.name}</h3>
          <span className="text-[11px] text-slate-500">by {s.settledBy === "agent" ? "CoPod agent" : "fallback"}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-[10px] uppercase text-slate-500">Metered</div>
            <div className="num font-semibold">{usd(s.meteredSpend)}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2">
            <div className="text-[10px] uppercase text-slate-500">Captured</div>
            <div className="num font-semibold text-emerald-600">{usd(s.captureAmount)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-[10px] uppercase text-slate-500">Released</div>
            <div className="num font-semibold">{usd(s.releasedAmount)}</div>
          </div>
        </div>
        {s.receipt && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[12.5px] leading-relaxed">{s.receipt}</p>}
        <div className="space-y-1 text-[11px] text-slate-500">
          {s.captures.map((c) => (
            <div key={c.captureId} className="num">
              capture {c.captureId} - {usd(c.amount)} ({c.status})
            </div>
          ))}
          {s.voids.map((v) => (
            <div key={v.authorizationId} className="num">
              void {v.authorizationId} - {usd(v.amount)}
            </div>
          ))}
        </div>
        <button onClick={onReset} className="w-full rounded-lg border border-slate-200 py-2 text-sm hover:bg-slate-50">
          Join again
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{me.name}</h3>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ring-1 ${statusColor[me.status]}`}>
            {me.status.replace("_", " ")}
          </span>
        </div>
        <div className="text-right">
          <div className="num text-lg font-semibold">{usd(me.available, 4)}</div>
          <div className="text-[11px] text-slate-500">of {usd(me.hold)} hold available</div>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full transition-all ${me.holdUsedPct >= 85 ? "bg-red-400" : me.holdUsedPct >= 60 ? "bg-amber-400" : "bg-emerald-400"}`}
          style={{ width: `${me.holdUsedPct}%` }}
        />
      </div>
      {me.policy?.reason && <p className="text-[12px] text-amber-700">Agent: {me.policy.reason}</p>}

      {me.pendingTopUp && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-[12px] text-amber-700">
            Top-up requested: {usd(me.pendingTopUp.amount)} - {me.pendingTopUp.reason}
          </p>
          <PayButton memberId={me.id} kind="topup" amount={me.pendingTopUp.amount} onAuthorized={() => {}} />
        </div>
      )}

      <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-[12px]">
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Base URL</span>
          <code className="num truncate">{base}</code>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">API key</span>
          <button className="num truncate text-left" onClick={() => setShowKey(!showKey)} title="click to reveal">
            {showKey ? identity.apiKey : `${identity.apiKey.slice(0, 12)}...`}
          </button>
        </div>
        <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-200">{`from openai import OpenAI
client = OpenAI(base_url="${base}", api_key="${showKey ? identity.apiKey : "cp_live_..."}")
client.chat.completions.create(model="${view.room.model}", messages=[...])`}</pre>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[12px]">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as "interactive" | "batch")}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1"
          >
            <option value="interactive">interactive</option>
            <option value="batch">batch</option>
          </select>
          <label className="flex items-center gap-1 text-slate-500">
            max_tokens
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="num w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900"
            />
          </label>
        </div>
        <button
          onClick={send}
          disabled={!!busy}
          className="w-full rounded-lg bg-copod-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy === "prompt" ? "Running on the pool..." : "Send a test prompt through the proxy"}
        </button>
        {out && (
          <div className={`rounded-lg p-2 text-[12px] ${out.error ? "bg-red-50 text-red-700" : "bg-slate-50"}`}>
            <p className="line-clamp-5 whitespace-pre-wrap">{out.text}</p>
            <p className="mt-1 text-[11px] text-slate-500">{out.meta}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => inject(Math.max(1, Math.round(me.available * 0.9 * 100) / 100))}
          disabled={!!busy}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-[12px] text-slate-500 hover:bg-slate-50"
          title="Records a simulated batch workload against your hold, to demo guardrails and top-ups"
        >
          Simulate heavy batch job
        </button>
        <button
          onClick={leave}
          disabled={!!busy}
          className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
        >
          {busy === "leave" ? "Agent settling..." : "Leave room & settle"}
        </button>
      </div>
    </div>
  );
}
