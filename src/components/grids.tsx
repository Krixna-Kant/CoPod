"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  colorSchemeDarkBlue,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import type { RoomView } from "@/lib/view";
import { clock, int, statusColor, usd } from "./format";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withPart(colorSchemeDarkBlue).withParams({
  backgroundColor: "#0b1222",
  headerBackgroundColor: "#0f1830",
  oddRowBackgroundColor: "#0d1528",
  borderColor: "#1d2943",
  foregroundColor: "#dbe3f3",
  headerTextColor: "#8fa0c2",
  accentColor: "#5b8cff",
  fontSize: 12.5,
  headerFontSize: 11.5,
  rowHeight: 38,
  headerHeight: 36,
  spacing: 6,
  wrapperBorderRadius: 12,
});

type Member = RoomView["members"][number];
type Payment = RoomView["payments"][number];
type Usage = RoomView["recentUsage"][number];

const money = (d = 2) => (p: ValueFormatterParams) => usd(p.value, d);
const count = (p: ValueFormatterParams) => int(p.value);

function NameCell(p: ICellRendererParams<Member>) {
  const m = p.data;
  if (!m) return null;
  if (p.node.rowPinned) return <span className="font-semibold text-slate-300">Room total</span>;
  return (
    <span className="flex h-full items-center gap-2">
      <span className="font-medium">{m.name}</span>
      {m.simulated && <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] leading-none text-slate-300">SIM</span>}
    </span>
  );
}

function StatusCell(p: ICellRendererParams<Member>) {
  if (!p.value) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${statusColor[p.value] ?? ""}`}>
      {String(p.value).replace("_", " ")}
    </span>
  );
}

function HoldBar(p: ICellRendererParams<Member>) {
  const v = Number(p.value ?? 0);
  const color = v >= 85 ? "bg-red-400" : v >= 60 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex h-full items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-700/60">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
      <span className="num text-[11px] text-slate-300">{v.toFixed(1)}%</span>
    </div>
  );
}

export function LedgerGrid({ members, onSelect }: { members: Member[]; onSelect?: (id: string) => void }) {
  const cols = useMemo<ColDef<Member>[]>(
    () => [
      { field: "name", headerName: "Member", cellRenderer: NameCell, pinned: "left", minWidth: 190 },
      { field: "status", cellRenderer: StatusCell, width: 125 },
      { field: "hold", headerName: "PayPal hold", valueFormatter: money(), enableCellChangeFlash: true, width: 115 },
      { field: "spend", headerName: "Metered spend", valueFormatter: money(4), enableCellChangeFlash: true, width: 130 },
      { field: "available", headerName: "Available", valueFormatter: money(4), enableCellChangeFlash: true, width: 115 },
      { field: "holdUsedPct", headerName: "Hold used", cellRenderer: HoldBar, width: 150 },
      { field: "burnPerMin", headerName: "Burn / min", valueFormatter: money(4), enableCellChangeFlash: true, width: 110 },
      {
        field: "runwayMin",
        headerName: "Runway",
        width: 100,
        valueFormatter: (p) => (p.value === null || p.value === undefined ? "-" : p.value > 600 ? "> 10h" : `${p.value.toFixed(1)}m`),
        cellClassRules: { "text-red-300": (p) => p.value !== null && p.value < 10 },
      },
      { field: "tokensPerSec", headerName: "Tok/s", valueFormatter: count, width: 85 },
      { field: "usage.inputTokens", headerName: "Input tok", valueFormatter: count, enableCellChangeFlash: true, width: 110 },
      { field: "usage.outputTokens", headerName: "Output tok", valueFormatter: count, enableCellChangeFlash: true, width: 110 },
      { field: "usage.gpuMs", headerName: "GPU ms", valueFormatter: count, width: 105 },
      { field: "usage.requests", headerName: "Reqs", valueFormatter: count, width: 80 },
      { field: "usage.cappedRequests", headerName: "Capped", width: 85 },
      { field: "usage.rejectedRequests", headerName: "Rejected", width: 90 },
      {
        headerName: "Agent policy",
        width: 220,
        valueGetter: (p) =>
          p.data?.policy ? `${p.data.policy.maxTokensCap ? `cap ${p.data.policy.maxTokensCap} tok - ` : ""}${p.data.policy.reason ?? ""}` : "",
        tooltipValueGetter: (p) => p.value,
      },
      {
        headerName: "Top-up",
        width: 110,
        valueGetter: (p) => (p.data?.pendingTopUp ? usd(p.data.pendingTopUp.amount) + " pending" : ""),
      },
      { field: "captured", headerName: "Captured", valueFormatter: money(), enableCellChangeFlash: true, width: 105 },
      { field: "released", headerName: "Released", valueFormatter: money(), width: 105 },
    ],
    [],
  );

  const totals = useMemo(() => {
    const live = members.filter((m) => m.status !== "settled");
    const sum = (f: (m: Member) => number, arr = members) => arr.reduce((s, m) => s + f(m), 0);
    return [
      {
        id: "total",
        name: "Room total",
        hold: sum((m) => m.hold, live),
        spend: sum((m) => m.spend, live),
        available: sum((m) => m.available, live),
        burnPerMin: sum((m) => m.burnPerMin, live),
        tokensPerSec: sum((m) => m.tokensPerSec, live),
        captured: sum((m) => m.captured),
        released: sum((m) => m.released),
        usage: {
          inputTokens: sum((m) => m.usage.inputTokens),
          outputTokens: sum((m) => m.usage.outputTokens),
          gpuMs: sum((m) => m.usage.gpuMs),
          requests: sum((m) => m.usage.requests),
          cappedRequests: sum((m) => m.usage.cappedRequests),
          rejectedRequests: sum((m) => m.usage.rejectedRequests),
        },
      } as unknown as Member,
    ];
  }, [members]);

  return (
    <div style={{ height: Math.min(470, 90 + members.length * 38 + 38) }}>
      <AgGridReact<Member>
        theme={theme}
        rowData={members}
        columnDefs={cols}
        getRowId={(p) => p.data.id}
        pinnedBottomRowData={totals}
        defaultColDef={{ sortable: true, resizable: true, filter: false }}
        cellFlashDuration={600}
        cellFadeDuration={900}
        onRowClicked={(e) => e.data && !e.node.rowPinned && onSelect?.(e.data.id)}
        tooltipShowDelay={300}
      />
    </div>
  );
}

const payColor: Record<string, string> = {
  ORDER_CREATED: "text-slate-300",
  AUTHORIZED: "text-sky-300",
  CAPTURED: "text-emerald-300",
  VOIDED: "text-amber-300",
  WEBHOOK: "text-violet-300",
  ERROR: "text-red-300",
};

export function PaymentsGrid({ payments, names }: { payments: Payment[]; names: Record<string, string> }) {
  const cols = useMemo<ColDef<Payment>[]>(
    () => [
      { field: "at", headerName: "Time", valueFormatter: (p) => clock(p.value), width: 105, sort: "desc" },
      {
        field: "type",
        width: 135,
        cellRenderer: (p: ICellRendererParams<Payment>) => <span className={`font-semibold ${payColor[p.value] ?? ""}`}>{p.value}</span>,
      },
      { field: "memberId", headerName: "Member", valueFormatter: (p) => names[p.value] ?? "-", width: 170 },
      { field: "amount", valueFormatter: money(), width: 100 },
      { field: "paypalId", headerName: "PayPal ID", width: 210, cellClass: "num" },
      { field: "detail", flex: 1, minWidth: 260, tooltipField: "detail" },
      {
        field: "mock",
        headerName: "Rail",
        width: 100,
        valueFormatter: (p) => (p.value ? "simulated" : "PayPal API"),
        cellClassRules: { "text-slate-500": (p) => !!p.value, "text-emerald-300": (p) => !p.value },
      },
    ],
    [names],
  );
  return (
    <div style={{ height: 300 }}>
      <AgGridReact<Payment>
        theme={theme}
        rowData={payments}
        columnDefs={cols}
        getRowId={(p) => p.data.id}
        defaultColDef={{ sortable: true, resizable: true }}
        animateRows
      />
    </div>
  );
}

export function RequestsGrid({ usage }: { usage: Usage[] }) {
  const cols = useMemo<ColDef<Usage>[]>(
    () => [
      { field: "at", headerName: "Time", valueFormatter: (p) => clock(p.value), width: 105, sort: "desc" },
      { field: "memberName", headerName: "Member", width: 150 },
      { field: "priority", width: 105 },
      {
        field: "outcome",
        width: 130,
        cellClassRules: {
          "text-emerald-300": (p) => p.value === "ok",
          "text-amber-300": (p) => p.value === "capped",
          "text-red-300": (p) => p.value === "rejected" || p.value === "upstream_error",
        },
      },
      { field: "inputTokens", headerName: "In", valueFormatter: count, width: 85 },
      { field: "outputTokens", headerName: "Out", valueFormatter: count, width: 85 },
      {
        headerName: "max_tokens",
        width: 125,
        valueGetter: (p) =>
          p.data?.requestedMaxTokens
            ? p.data.grantedMaxTokens && p.data.grantedMaxTokens !== p.data.requestedMaxTokens
              ? `${p.data.requestedMaxTokens} -> ${p.data.grantedMaxTokens}`
              : String(p.data.requestedMaxTokens)
            : "-",
      },
      { field: "cost", valueFormatter: money(5), width: 100 },
      { headerName: "Price /M", width: 100, valueGetter: (p) => (p.data ? `${p.data.inputPricePerM}/${p.data.outputPricePerM}` : "") },
      { field: "gpuMs", headerName: "GPU ms", valueFormatter: count, width: 95 },
      { field: "note", flex: 1, minWidth: 240, tooltipField: "note" },
    ],
    [],
  );
  return (
    <div style={{ height: 300 }}>
      <AgGridReact<Usage>
        theme={theme}
        rowData={usage}
        columnDefs={cols}
        getRowId={(p) => p.data.id}
        defaultColDef={{ sortable: true, resizable: true }}
        animateRows
      />
    </div>
  );
}
