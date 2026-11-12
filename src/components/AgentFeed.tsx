"use client";

import { useState } from "react";
import type { RoomView } from "@/lib/view";
import { ago } from "./format";

const toolLabel: Record<string, string> = {
  set_room_price: "Reprice room",
  set_member_policy: "Member policy",
  request_top_up: "Request top-up",
  settle_member: "PayPal settlement",
  verify_paypal_authorization: "Verify PayPal auth",
  broadcast_notice: "Broadcast",
  get_room_snapshot: "Read room state",
  get_member_activity: "Inspect activity",
};

function argSummary(tool: string, a: Record<string, unknown>) {
  switch (tool) {
    case "set_room_price":
      return `$${a.input_price_per_m}/M in, $${a.output_price_per_m}/M out - ${a.reason ?? ""}`;
    case "set_member_policy":
      return `${a.status}${a.max_tokens_cap ? ` (cap ${a.max_tokens_cap})` : ""} - ${a.reason ?? ""}`;
    case "request_top_up":
      return `$${a.amount_usd} - ${a.reason ?? ""}`;
    case "settle_member":
      return `capture $${a.capture_amount_usd}${a.credit_reason ? ` (credit: ${a.credit_reason})` : ""}`;
    case "broadcast_notice":
      return String(a.message ?? "");
    case "verify_paypal_authorization":
      return String(a.authorization_id ?? "");
    case "get_member_activity":
      return String(a.member_id ?? "");
    default:
      return "";
  }
}

export function AgentFeed({ decisions, now }: { decisions: RoomView["decisions"]; now: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = [...decisions].reverse();
  return (
    <div className="scroll-thin max-h-[560px] space-y-2 overflow-y-auto pr-1">
      {!list.length && <div className="p-4 text-sm text-slate-500">The agent will post its first decision shortly.</div>}
      {list.map((d) => {
        const writes = d.actions.filter((a) => !a.tool.startsWith("get_"));
        const reads = d.actions.length - writes.length;
        return (
          <div key={d.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="truncate" title={d.trigger}>
                {d.trigger}
              </span>
              <span className="shrink-0">{ago(d.at, now)}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-slate-800">{d.summary}</p>
            {writes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {writes.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[12px]">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${a.ok ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span>
                      <span className="font-medium text-slate-700">{toolLabel[a.tool] ?? a.tool}</span>{" "}
                      <span className="text-slate-500">{argSummary(a.tool, a.args)}</span>
                      {!a.ok && <span className="text-red-600"> - rejected: {String(a.result.error ?? "")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <span className={`rounded px-1.5 py-0.5 ${d.engine === "gemini" ? "bg-copod-50 text-copod-600" : "bg-slate-100"}`}>
                {d.engine === "gemini" ? d.model : "rule engine"}
              </span>
              <span>{(d.durationMs / 1000).toFixed(1)}s</span>
              {reads > 0 && <span>{reads} reads</span>}
              {d.error && (
                <button className="text-amber-600 underline" onClick={() => setOpen(open === d.id ? null : d.id)}>
                  note
                </button>
              )}
            </div>
            {open === d.id && d.error && <p className="mt-1 text-[11px] text-amber-700">{d.error}</p>}
          </div>
        );
      })}
    </div>
  );
}
