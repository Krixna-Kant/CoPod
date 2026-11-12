"use client";

import { useState } from "react";
import Link from "next/link";
import { post, useRoom } from "./useRoom";
import { StatsBar } from "./StatsBar";
import { LedgerGrid, PaymentsGrid, RequestsGrid } from "./grids";
import { PriceChart } from "./PriceChart";
import { AgentFeed } from "./AgentFeed";
import { MemberPanel } from "./MemberPanel";
import { ago } from "./format";
import type { LoadMode } from "@/lib/types";

export function RoomDashboard({ roomId }: { roomId: string }) {
  const { view, connected } = useRoom(roomId);
  const [tab, setTab] = useState<"payments" | "requests">("payments");
  const [agentBusy, setAgentBusy] = useState(false);

  if (!view) {
    return <div className="flex flex-1 items-center justify-center text-slate-500">Connecting to room...</div>;
  }

  const { room, config } = view;
  const names = Object.fromEntries(view.members.map((m) => [m.id, m.name]));
  const setMode = (mode: LoadMode) => post(`/api/rooms/${roomId}/sim`, { mode });

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-7 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
            <Link href="/#pools" className="hover:text-copod-600">
              Compute pools
            </Link>
            <span>/</span>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-copod-800">{room.category}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{room.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {room.hardware} - hosted by {room.hostName} - {room.epochHours}h settlement epochs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-red-500"}`} />
            {connected ? "live" : "reconnecting"}
          </span>
          <span className="rounded-md border border-slate-200 bg-white/70 px-2.5 py-1 text-slate-600">PayPal: {config.paypalMode}</span>
          <span className="rounded-md border border-slate-200 bg-white/70 px-2.5 py-1 text-slate-600">Agent: {config.agent}</span>
          <span className="rounded-md border border-slate-200 bg-white/70 px-2.5 py-1 text-slate-600">Upstream: {config.upstream}</span>
        </div>
      </header>

      <StatsBar view={view} />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <section className="glass-card rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Live escrow ledger</h2>
              <span className="text-[11px] text-slate-500">every row is a PayPal authorization being metered in real time</span>
            </div>
            <LedgerGrid members={view.members} />
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="glass-card rounded-2xl p-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">Utilization and dynamic price</h2>
                <div className="flex gap-1 text-[11px]">
                  {(["offpeak", "auto", "peak"] as LoadMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-md px-2 py-1 ${view.sim?.mode === m ? "bg-copod-600 text-white" : "bg-slate-50 text-slate-500 hover:text-slate-900"}`}
                    >
                      {m === "offpeak" ? "Simulate night" : m === "peak" ? "Simulate peak" : "Auto load"}
                    </button>
                  ))}
                </div>
              </div>
              <PriceChart prices={view.prices} base={room.baseOutputPricePerM} />
            </section>
            <section className="glass-card rounded-2xl p-3">
              <h2 className="mb-2 px-1 text-sm font-semibold">Room notices</h2>
              <ul className="scroll-thin max-h-[180px] space-y-1.5 overflow-y-auto pr-1 text-[12px]">
                {[...view.notices].reverse().map((n) => (
                  <li key={n.id} className="flex gap-2">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        n.level === "critical" ? "bg-red-400" : n.level === "warning" ? "bg-amber-400" : "bg-sky-400"
                      }`}
                    />
                    <span className="flex-1">{n.message}</span>
                    <span className="shrink-0 text-slate-500">{ago(n.at, view.now)}</span>
                  </li>
                ))}
                {!view.notices.length && <li className="text-slate-500">No notices yet.</li>}
              </ul>
            </section>
          </div>

          <section className="glass-card rounded-2xl p-3">
            <div className="mb-2 flex items-center gap-1 px-1 text-sm">
              {(["payments", "requests"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${tab === t ? "bg-slate-50 text-slate-900" : "text-slate-500"}`}
                >
                  {t === "payments" ? "PayPal payment events" : "Metered requests (guardrail log)"}
                </button>
              ))}
            </div>
            {tab === "payments" ? <PaymentsGrid payments={view.payments} names={names} /> : <RequestsGrid usage={view.recentUsage} />}
          </section>
        </div>

        <aside className="space-y-4">
          <MemberPanel view={view} />
          <section className="glass-card rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Autonomous treasurer</h2>
              <button
                disabled={agentBusy}
                onClick={async () => {
                  setAgentBusy(true);
                  try {
                    await post(`/api/rooms/${roomId}/agent`);
                  } finally {
                    setAgentBusy(false);
                  }
                }}
                className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-60"
              >
                {agentBusy ? "Thinking..." : "Run review now"}
              </button>
            </div>
            <AgentFeed decisions={view.decisions} now={view.now} />
          </section>
        </aside>
      </div>
    </div>
  );
}
