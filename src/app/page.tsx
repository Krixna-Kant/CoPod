import Link from "next/link";
import { connection } from "next/server";
import { ensureEngine } from "@/lib/engine";
import { db, membersOf } from "@/lib/store";
import { isLive, roomUtilization } from "@/lib/ledger";

const steps = [
  {
    title: "Escrow, not subscriptions",
    body: "Join a room by placing a refundable PayPal authorization (Orders API, intent AUTHORIZE). No money moves until settlement.",
  },
  {
    title: "Metered on a shared dedicated pool",
    body: "Point any OpenAI SDK at CoPod. Every request is metered per token and checked against your remaining hold before it reaches the GPU.",
  },
  {
    title: "An autonomous treasurer",
    body: "A Gemini agent with PayPal tools reprices idle or congested capacity, throttles risky burn, requests top-ups and decides settlements.",
  },
  {
    title: "Exact fractional settlement",
    body: "On exit the agent captures exactly what you used (final_capture=true) and PayPal releases the rest of the hold, inside the honor period.",
  },
];

export default async function Home() {
  await connection();
  ensureEngine();
  const rooms = Object.values(db().rooms);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <span className="rounded-full px-3 py-1 text-xs text-accent ring-1 ring-accent/40">PayPal + AI agentic commerce</span>
        <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Dedicated AI compute, shared by the seat.
          <br />
          <span className="text-muted">Settled to the cent by an autonomous PayPal agent.</span>
        </h1>
        <p className="mt-5 text-lg text-muted">
          Dedicated GPU clusters cost $1,000-$10,000+ a month, so indie developers are stuck on rate-limited public APIs while
          small teams that do rent capacity leave half of it idle. CoPod lets them pool funds into one dedicated room, with PayPal
          authorization holds as escrow and an AI treasurer running the money.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {rooms.map((r) => {
          const members = membersOf(r.id).filter(isLive);
          const util = Math.round(roomUtilization(r) * 100);
          return (
            <Link key={r.id} href={`/rooms/${r.id}`} className="panel group block p-5 transition hover:border-accent/60">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{r.name}</h2>
                  <p className="text-sm text-muted">{r.hardware}</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">live</span>
              </div>
              <div className="num mt-5 grid grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[11px] uppercase text-muted">Pool</div>${r.monthlyCost.toLocaleString()}/mo
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted">Seats</div>
                  {members.length}/{r.maxSeats}
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted">Load</div>
                  {util}%
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted">Deposit</div>${r.depositAmount}
                </div>
              </div>
              <div className="mt-5 text-sm text-accent group-hover:underline">Open room dashboard</div>
            </Link>
          );
        })}
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="panel p-4">
            <div className="num text-xs text-accent">0{i + 1}</div>
            <h3 className="mt-2 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
