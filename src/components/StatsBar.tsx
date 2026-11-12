"use client";

import type { RoomView } from "@/lib/view";
import { usd } from "./format";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function StatsBar({ view }: { view: RoomView }) {
  const { room, members, utilization } = view;
  const live = members.filter((m) => m.status !== "settled");
  const change = Math.round((room.outputPricePerM / room.baseOutputPricePerM - 1) * 100);
  const util = Math.round(utilization * 100);
  const held = live.reduce((s, m) => s + m.hold, 0);
  const metered = live.reduce((s, m) => s + m.spend, 0);
  const captured = members.reduce((s, m) => s + m.captured, 0);
  const released = members.reduce((s, m) => s + m.released, 0);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Price / 1M tokens"
        value={`$${room.inputPricePerM.toFixed(2)} / $${room.outputPricePerM.toFixed(2)}`}
        sub={change === 0 ? "base price (in / out)" : `${change > 0 ? "+" : ""}${change}% vs base`}
        tone={change < 0 ? "text-emerald-300" : change > 0 ? "text-amber-300" : ""}
      />
      <Stat
        label="Cluster utilization"
        value={`${util}%`}
        sub={util < 30 ? "idle - discount zone" : util > 85 ? "congested - peak zone" : "healthy band"}
        tone={util < 30 ? "text-emerald-300" : util > 85 ? "text-red-300" : ""}
      />
      <Stat label="Seats" value={`${live.length} / ${room.maxSeats}`} sub={`${usd(room.monthlyCost, 0)}/mo pool`} />
      <Stat label="PayPal holds (escrow)" value={usd(held)} sub={`${usd(metered, 4)} metered, uncaptured`} />
      <Stat label="Captured to host" value={usd(captured)} tone="text-emerald-300" sub="final partial captures" />
      <Stat label="Released to payers" value={usd(released)} sub="unused holds returned" />
    </div>
  );
}
