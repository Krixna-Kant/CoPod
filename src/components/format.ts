export const usd = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "-" : `$${n.toFixed(digits)}`;

export const int = (n: number | null | undefined) => (n === null || n === undefined ? "-" : Math.round(n).toLocaleString());

export const pct = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "-" : `${n.toFixed(digits)}%`;

export const ago = (t: number, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

export const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const statusColor: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  throttled: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  batch_paused: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  suspended: "bg-red-500/15 text-red-300 ring-red-500/30",
  settling: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  settled: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  pending_authorization: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};
