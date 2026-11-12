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
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  throttled: "bg-amber-50 text-amber-700 ring-amber-200",
  batch_paused: "bg-orange-50 text-orange-700 ring-orange-200",
  suspended: "bg-red-50 text-red-700 ring-red-200",
  settling: "bg-sky-50 text-sky-700 ring-sky-200",
  settled: "bg-slate-100 text-slate-600 ring-slate-200",
  pending_authorization: "bg-slate-100 text-slate-600 ring-slate-200",
};
