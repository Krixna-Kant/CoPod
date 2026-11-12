"use client";

import type { RoomView } from "@/lib/view";

export function PriceChart({ prices, base }: { prices: RoomView["prices"]; base: number }) {
  const pts = prices.slice(-120);
  const W = 640;
  const H = 170;
  const pad = { l: 34, r: 40, t: 10, b: 18 };
  if (pts.length < 2) {
    return <div className="flex h-[170px] items-center justify-center text-sm text-slate-500">Collecting utilization data...</div>;
  }
  const x = (i: number) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
  const yU = (u: number) => pad.t + (1 - Math.min(1, u)) * (H - pad.t - pad.b);
  const maxP = base * 1.45;
  const minP = base * 0.55;
  const yP = (p: number) => pad.t + (1 - (p - minP) / (maxP - minP)) * (H - pad.t - pad.b);

  const area =
    `M ${x(0)} ${yU(0)} ` + pts.map((p, i) => `L ${x(i)} ${yU(p.utilization)}`).join(" ") + ` L ${x(pts.length - 1)} ${yU(0)} Z`;
  const price = pts.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${yP(p.outputPricePerM)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[170px] w-full">
      <defs>
        <linearGradient id="u" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0066ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0066ff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.3, 0.85].map((b) => (
        <g key={b}>
          <line x1={pad.l} x2={W - pad.r} y1={yU(b)} y2={yU(b)} stroke={b === 0.3 ? "#34d39955" : "#f8717155"} strokeDasharray="4 4" />
          <text x={4} y={yU(b) + 3} fontSize="9" fill="#64748b">
            {b * 100}%
          </text>
        </g>
      ))}
      <path d={area} fill="url(#u)" stroke="#0066ff" strokeWidth="1.5" />
      <line x1={pad.l} x2={W - pad.r} y1={yP(base)} y2={yP(base)} stroke="#d9770633" />
      <path d={price} fill="none" stroke="#d97706" strokeWidth="2" />
      <text x={W - pad.r + 4} y={yP(pts[pts.length - 1].outputPricePerM) + 3} fontSize="10" fill="#d97706">
        ${pts[pts.length - 1].outputPricePerM}
      </text>
      <text x={pad.l} y={H - 4} fontSize="9" fill="#64748b">
        utilization (blue) vs output price per 1M tokens (amber), last {Math.round((pts.length * 5) / 60)} min
      </text>
    </svg>
  );
}
