import Link from "next/link";
import { connection } from "next/server";
import { ensureEngine } from "@/lib/engine";
import { db, membersOf } from "@/lib/store";
import { isLive, roomUtilization } from "@/lib/ledger";
import { paypalMock } from "@/lib/paypal";
import { AutoRefresh } from "@/components/AutoRefresh";

const accents = ["border-t-copod-600", "border-t-indigo-500", "border-t-sky-500", "border-t-teal-500"];
const chips = ["bg-blue-100 text-copod-800", "bg-indigo-100 text-indigo-800", "bg-sky-100 text-sky-800", "bg-teal-100 text-teal-800"];

const Icon = {
  bolt: <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />,
  shield: (
    <path
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  ),
  lock: (
    <path
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  ),
  user: <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />,
  server: (
    <path
      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  ),
  arrow: <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />,
};

function Svg({ d, className }: { d: React.ReactNode; className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {d}
    </svg>
  );
}

const usd = (n: number, d = 2) => `$${n.toFixed(d)}`;

export default async function Home() {
  await connection();
  ensureEngine();
  const s = db();
  const rooms = Object.values(s.rooms);
  const main = s.rooms.room_gptoss120b ?? rooms[0];
  const mainUtil = roomUtilization(main);
  const mainMembers = membersOf(main.id);
  const lastRequest = [...s.usage].reverse().find((u) => u.roomId === main.id && !s.members[u.memberId]?.simulated && !u.backfill);
  const lastDecision = [...s.decisions].reverse().find((d) => d.roomId === main.id);
  const settled = Object.values(s.members)
    .filter((m) => m.settlement && !m.simulated)
    .sort((a, b) => (b.settlement!.settledAt ?? 0) - (a.settlement!.settledAt ?? 0))[0];
  const receipt = settled?.settlement
    ? { hold: settled.settlement.captureAmount + settled.settlement.releasedAmount, used: settled.settlement.captureAmount, released: settled.settlement.releasedAmount, live: true }
    : { hold: 50, used: 1.8, released: 48.2, live: false };
  const priceDelta = Math.round((main.outputPricePerM / main.baseOutputPricePerM - 1) * 100);
  const mode = paypalMock() ? "mock" : "sandbox";

  return (
    <main>
      <AutoRefresh ms={15000} />
      <section className="relative overflow-hidden pb-16 pt-12 md:pb-24 md:pt-20">
        <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-md md:text-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-copod-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-copod-600" />
            </span>
            <span>No enterprise minimums. Pay per token.</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-copod-700">PayPal × Gemini agent</span>
          </div>

          <h1 className="mx-auto mb-6 max-w-5xl text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Enterprise H100 GPUs. <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-copod-700 via-copod-600 to-sky-500 bg-clip-text text-transparent">
              Fractional Cost. Zero Overdraft Risk.
            </span>
          </h1>

          <p className="mx-auto mb-9 max-w-3xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            Pool dedicated AI clusters with other developers. A refundable PayPal authorization is your escrow, every token is
            metered against it, and an autonomous agent captures exactly what you used when you leave.
          </p>

          <div className="mb-12 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4">
            <Link
              href={`/rooms/${main.id}`}
              className="shimmer-btn inline-flex w-full items-center justify-center gap-2 rounded-xl bg-copod-600 px-7 py-3.5 text-base font-bold text-white shadow-blue-glow transition-all hover:bg-copod-700 active:scale-[0.98] sm:w-auto"
            >
              <Svg d={Icon.bolt} className="h-5 w-5" />
              Join a Pool (${main.depositAmount} sandbox hold)
            </Link>
            <a
              href="#live"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-6 py-3.5 text-base font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-copod-600 sm:w-auto"
            >
              <svg className="h-5 w-5 text-copod-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  clipRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  fillRule="evenodd"
                />
              </svg>
              See the live ledger
            </a>
          </div>

          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-6 border-t border-slate-200/60 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:gap-10">
            <div className="flex items-center gap-2">
              <Svg d={Icon.shield} className="h-4 w-4 text-copod-600" />
              <span>Settles inside PayPal&apos;s 3-day honor period</span>
            </div>
            <div className="flex items-center gap-2">
              <Svg d={Icon.bolt} className="h-4 w-4 text-emerald-500" />
              <span>Per-token metering, OpenAI-compatible</span>
            </div>
            <div className="flex items-center gap-2">
              <Svg d={Icon.lock} className="h-4 w-4 text-copod-600" />
              <span>Spend capped at your authorization</span>
            </div>
          </div>
        </div>

        <div id="live" className="mx-auto mt-12 max-w-6xl scroll-mt-24 px-4 sm:mt-16 sm:px-6 lg:px-8">
          <div className="glass-card relative overflow-hidden rounded-2xl p-4 shadow-glass sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-rose-400/80" />
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-amber-400/80" />
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-emerald-400/80" />
                <span className="ml-2 font-mono text-xs font-medium text-slate-500">copod://{main.id}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live room: {mainMembers.filter(isLive).length} / {main.maxSeats} seats
                </span>
                <span className="font-mono text-xs text-slate-400">PayPal: {mode}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="flex flex-col justify-between rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-200 shadow-inner sm:p-5">
                <div>
                  <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3 text-slate-400">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      Latest metered request
                    </span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">OpenAI drop-in</span>
                  </div>
                  <div className="space-y-2 text-[11px] leading-relaxed text-slate-300">
                    <p className="text-slate-500"># {lastRequest ? "from the live proxy" : "waiting for the first request"}</p>
                    <p>
                      <span className="text-emerald-400">POST</span> /v1/chat/completions
                    </p>
                    <p className="text-slate-400">
                      model: <span className="text-copod-300">&quot;{main.model}&quot;</span>
                    </p>
                    <p className="text-slate-400">
                      tokens: <span className="font-bold text-amber-300">{lastRequest ? `${lastRequest.inputTokens} in / ${lastRequest.outputTokens} out` : "-"}</span>
                    </p>
                    <p className="text-slate-400">
                      cost: <span className="text-emerald-400">{lastRequest ? usd(lastRequest.cost, 5) : "-"}</span> | outcome:{" "}
                      <span className={lastRequest?.outcome === "capped" ? "text-amber-300" : "text-emerald-400"}>{lastRequest?.outcome ?? "-"}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-[11px]">
                  <span className="text-slate-400">Guardrail:</span>
                  <span className="font-semibold tracking-wider text-emerald-400">
                    {lastRequest?.grantedMaxTokens && lastRequest.requestedMaxTokens && lastRequest.grantedMaxTokens < lastRequest.requestedMaxTokens
                      ? `max_tokens ${lastRequest.requestedMaxTokens}->${lastRequest.grantedMaxTokens}`
                      : "PRE-FLIGHT CHECKED"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50/70 to-indigo-50/50 p-4 sm:p-5">
                <div>
                  <div className="mb-3 flex items-center justify-between border-b border-blue-200/60 pb-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-copod-800">
                      <span className="h-2 w-2 rounded-full bg-copod-600" />
                      Autonomous treasurer
                    </span>
                    <span className="rounded bg-copod-100 px-2 py-0.5 text-[10px] font-semibold text-copod-700">
                      {lastDecision?.engine === "gemini" ? "Gemini" : "Agent"}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Cluster utilization:</span>
                      <span className="font-mono font-semibold text-slate-900">{Math.round(mainUtil * 100)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Dynamic adjustment:</span>
                      <span className={`font-mono font-semibold ${priceDelta < 0 ? "text-emerald-600" : priceDelta > 0 ? "text-amber-600" : "text-slate-900"}`}>
                        {priceDelta === 0 ? "base price" : `${priceDelta > 0 ? "+" : ""}${priceDelta}% ${priceDelta < 0 ? "discount" : "peak"}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Rate (in / out):</span>
                      <span className="font-mono font-semibold text-copod-700">
                        ${main.inputPricePerM.toFixed(2)} / ${main.outputPricePerM.toFixed(2)} per 1M
                      </span>
                    </div>
                    <div className="mt-2 line-clamp-4 rounded-lg border border-blue-100 bg-white/90 p-2.5 text-[11px] text-slate-600">
                      <span className="font-semibold text-copod-700">Latest decision:</span> {lastDecision?.summary ?? "The agent posts its first review shortly."}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-blue-200/60 pt-3 text-xs">
                  <span className="font-medium text-slate-500">Review cycle:</span>
                  <span className="font-mono font-semibold text-copod-700">periodic + event-driven</span>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <svg className="h-3.5 w-3.5 text-copod-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.8 1.57 1.258 1.057 1.764 2.65 1.503 4.736-.364 2.91-1.848 5.174-4.409 6.728-1.572.955-3.585 1.44-5.986 1.44H8.483l-1.407 6.862z" />
                      </svg>
                      PayPal settlement receipt
                    </span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {receipt.live ? "Latest settlement" : "Example"}
                    </span>
                  </div>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Authorization hold:</span>
                      <span className="font-semibold text-slate-700">{usd(receipt.hold)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-copod-600">
                      <span>Inference used:</span>
                      <span>{usd(receipt.used)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900">
                      <span>Captured to host:</span>
                      <span className="text-copod-700">{usd(receipt.used)}</span>
                    </div>
                    <div className="mt-2 flex justify-between rounded-lg border border-emerald-100 bg-emerald-50/70 p-2 text-[11px] font-bold text-emerald-600">
                      <span>Released to payer:</span>
                      <span>{usd(receipt.released)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  <span>Capture mode:</span>
                  <span className="font-mono font-medium text-slate-700">final_capture: true</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative scroll-mt-20 border-y border-slate-200/70 bg-white/70 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-copod-600">Autonomous lifecycle</h2>
            <p className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">How CoPod pools compute in 3 steps</p>
            <p className="mt-3 text-base text-slate-600">No long contracts and no surprise bills, built entirely on standard PayPal payment rails.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                t: "1-click PayPal authorization",
                b: "Joining places a refundable hold with the Orders API (intent AUTHORIZE). Nothing is charged; your seat and API key are issued once PayPal confirms the hold.",
                f: (
                  <>
                    <span className="text-copod-600">Status:</span> AUTHORIZED - awaiting usage
                  </>
                ),
              },
              {
                t: "Per-token metering with guardrails",
                b: "Point your OpenAI SDK at CoPod. Before each request reaches the GPU, the proxy checks your remaining hold and lowers max_tokens so you can never overspend it.",
                f: (
                  <>
                    <span className="text-copod-600">Guardrail:</span> worst-case cost must fit the hold
                  </>
                ),
              },
              {
                t: "Exit and exact partial capture",
                b: "Leave at any time. The agent captures exactly what you used with final_capture=true and PayPal releases the rest of the hold back to you.",
                f: (
                  <>
                    <span className="font-semibold">Example:</span> $12.45 captured, $37.55 released
                  </>
                ),
                good: true,
              },
            ].map((c, i) => (
              <div key={c.t} className="glass-card glass-card-interactive relative rounded-2xl p-7">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-200 bg-blue-100 text-lg font-bold text-copod-700">
                  0{i + 1}
                </div>
                <h3 className="mb-2.5 text-xl font-bold text-slate-900">{c.t}</h3>
                <p className="mb-4 text-sm leading-relaxed text-slate-600">{c.b}</p>
                <div
                  className={`rounded-lg border p-2.5 font-mono text-xs ${c.good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                >
                  {c.f}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pools" className="relative scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col justify-between md:flex-row md:items-end">
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-copod-600">Available pools</h2>
              <p className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Active compute rooms</p>
              <p className="mt-2 text-base text-slate-600">Zero commitment. Authorized on PayPal. Leave whenever your run is done.</p>
            </div>
            <div className="mt-4 md:mt-0">
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-copod-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                {rooms.length} rooms online
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r, i) => {
              const seats = membersOf(r.id).filter(isLive).length;
              const util = Math.round(roomUtilization(r) * 100);
              const discounted = r.outputPricePerM < r.baseOutputPricePerM;
              return (
                <div key={r.id} className={`glass-card glass-card-interactive flex flex-col justify-between rounded-2xl border-t-4 p-6 ${accents[i % accents.length]}`}>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${chips[i % chips.length]}`}>{r.category}</span>
                      <span className="font-mono text-xs font-semibold text-emerald-600">
                        {seats}/{r.maxSeats} seats
                      </span>
                    </div>
                    <h3 className="mb-1 text-lg font-bold text-slate-900">{r.name}</h3>
                    <p className="mb-4 text-xs text-slate-500">
                      {r.hardware} - ${r.monthlyCost.toLocaleString()}/mo pool
                    </p>
                    <div className="space-y-2 border-t border-slate-100 pt-3 font-mono text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Hold amount:</span>
                        <span className="font-bold text-slate-900">{usd(r.depositAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Output rate:</span>
                        <span className={`font-bold ${discounted ? "text-emerald-600" : "text-copod-600"}`}>
                          ${r.outputPricePerM.toFixed(2)} / 1M{" "}
                          {discounted && <span className="font-normal text-slate-400 line-through">${r.baseOutputPricePerM.toFixed(2)}</span>}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Utilization:</span>
                        <span className="text-slate-900">{util}%</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/rooms/${r.id}`}
                    className="mt-6 w-full rounded-xl bg-slate-900 py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-copod-600"
                  >
                    Open room &amp; authorize seat ({usd(r.depositAmount, 0)})
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="escrow" className="scroll-mt-20 border-t border-slate-200/80 bg-slate-100/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-copod-600">Why it works</h2>
            <p className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Shared capacity, settled by an agent</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                i: Icon.user,
                t: "For individual developers",
                b: "Dedicated-cluster throughput without a $1,000-$10,000/month commitment. Your spend can never exceed the PayPal hold you approved.",
                f: "Drop-in OpenAI SDK compatible",
              },
              {
                i: Icon.server,
                t: "For compute hosts",
                b: "Sell idle overnight capacity by the seat. Authorizations are placed up front, so usage is backed by funds PayPal has already reserved.",
                f: "Exact captures paid to the host",
              },
              {
                i: Icon.shield,
                t: "Autonomous financial safety",
                b: "The Gemini treasurer forecasts each member's runway, reprices idle or congested capacity, pauses risky batch traffic, requests top-ups and settles - with hard limits enforced in code.",
                f: "Every decision logged and auditable",
              },
            ].map((c) => (
              <div key={c.t} className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
                <div>
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-copod-600">
                    <Svg d={c.i} className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-slate-900">{c.t}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{c.b}</p>
                </div>
                <div className="mt-6 flex items-center gap-1 border-t border-slate-100 pt-4 text-xs font-semibold text-copod-600">
                  <span>{c.f}</span> →
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-20">
        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div className="glass-card rounded-3xl border border-blue-200/80 bg-gradient-to-b from-white/95 to-blue-50/70 p-8 shadow-glass-hover sm:p-14">
            <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-copod-600 text-white shadow-blue-glow">
              <Svg d={Icon.bolt} className="h-7 w-7" />
            </span>
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Ready to pool enterprise compute?</h2>
            <p className="mx-auto mb-8 max-w-2xl text-base text-slate-600 sm:text-lg">
              Start in sandbox mode with a refundable PayPal authorization. Send real prompts, watch the agent work, and verify the
              partial capture in your PayPal sandbox dashboard.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href={`/rooms/${main.id}`}
                className="shimmer-btn inline-flex w-full items-center justify-center gap-2 rounded-xl bg-copod-600 px-8 py-4 text-base font-bold text-white shadow-blue-glow transition-all hover:bg-copod-700 active:scale-[0.98] sm:w-auto"
              >
                Enter a compute room
                <Svg d={Icon.arrow} className="ml-1 h-5 w-5" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-4 text-base font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto"
              >
                Read the docs
              </Link>
            </div>
            <div className="mt-8 flex items-center justify-center gap-2 font-mono text-xs text-slate-500">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  clipRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  fillRule="evenodd"
                />
              </svg>
              <span>Sandbox mode: no real funds move.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
