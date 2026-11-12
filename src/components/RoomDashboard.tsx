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
    return <div className="flex flex-1 items-center justify-center text-muted">Connecting to room...</div>;
  }

  const { room, config } = view;
  const names = Object.fromEntries(view.members.map((m) => [m.id, m.name]));
  const setMode = (mode: LoadMode) => post(`/api/rooms/${roomId}/sim`, { mode });

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-muted hover:text-foreground">
            CoPod
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{room.name}</h1>
          <p className="text-sm text-muted">
            {room.hardware} - hosted by {room.hostName} - {room.epochHours}h settlement epochs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2 py-1 ring-1 ${connected ? "text-emerald-300 ring-emerald-500/30" : "text-red-300 ring-red-500/30"}`}>
            {connected ? "live" : "reconnecting"}
          </span>
          <span className="rounded-full px-2 py-1 text-slate-300 ring-1 ring-line">PayPal: {config.paypalMode}</span>
          <span className="rounded-full px-2 py-1 text-slate-300 ring-1 ring-line">Agent: {config.agent}</span>
          <span className="rounded-full px-2 py-1 text-slate-300 ring-1 ring-line">Upstream: {config.upstream}</span>
        </div>
      </header>

      <StatsBar view={view} />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <section className="panel p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Live escrow ledger</h2>
              <span className="text-[11px] text-muted">every row is a PayPal authorization being metered in real time</span>
            </div>
            <LedgerGrid members={view.members} />
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="panel p-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">Utilization and dynamic price</h2>
                <div className="flex gap-1 text-[11px]">
                  {(["offpeak", "auto", "peak"] as LoadMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-md px-2 py-1 ${view.sim?.mode === m ? "bg-accent text-white" : "bg-panel-2 text-muted hover:text-foreground"}`}
                    >
                      {m === "offpeak" ? "Simulate night" : m === "peak" ? "Simulate peak" : "Auto load"}
                    </button>
                  ))}
                </div>
              </div>
              <PriceChart prices={view.prices} base={room.baseOutputPricePerM} />
            </section>
            <section className="panel p-3">
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
                    <span className="shrink-0 text-muted">{ago(n.at, view.now)}</span>
                  </li>
                ))}
                {!view.notices.length && <li className="text-muted">No notices yet.</li>}
              </ul>
            </section>
          </div>

          <section className="panel p-3">
            <div className="mb-2 flex items-center gap-1 px-1 text-sm">
              {(["payments", "requests"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${tab === t ? "bg-panel-2 text-foreground" : "text-muted"}`}
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
          <section className="panel p-3">
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
                className="rounded-md bg-panel-2 px-2 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-60"
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
