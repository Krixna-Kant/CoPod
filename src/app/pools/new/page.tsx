"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MODELS = [
  { model: "gpt-oss-120b", label: "GPT-OSS 120B (MoE)", input: 10, output: 30, capacity: 1500, hardware: "8x H100 80GB (provisioned)" },
  { model: "gpt-oss-20b", label: "GPT-OSS 20B", input: 2, output: 5, capacity: 2500, hardware: "2x L40S 48GB (provisioned)" },
  { model: "qwen3.8-27b", label: "Qwen3.8 27B (reasoning)", input: 6, output: 18, capacity: 900, hardware: "4x H100 80GB (provisioned)" },
];

const CATEGORIES = ["High Throughput", "Reasoning", "Batch", "Coding", "General"];

const input =
  "w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-copod-500 focus:ring-4 focus:ring-copod-500/10";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export default function NewPool() {
  const router = useRouter();
  const [f, setF] = useState({
    name: "",
    hostName: "",
    hostPayeeEmail: "",
    model: MODELS[0].model,
    category: CATEGORIES[0],
    tagline: "",
    hardware: MODELS[0].hardware,
    monthlyCost: 1200,
    maxSeats: 24,
    depositAmount: 50,
    baseInputPricePerM: MODELS[0].input,
    baseOutputPricePerM: MODELS[0].output,
    capacityTokensPerSec: MODELS[0].capacity,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const pickModel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = MODELS.find((x) => x.model === e.target.value)!;
    setF((p) => ({ ...p, model: m.model, hardware: m.hardware, baseInputPricePerM: m.input, baseOutputPricePerM: m.output, capacityTokensPerSec: m.capacity }));
  };

  const perSeat = f.maxSeats > 0 ? f.monthlyCost / f.maxSeats : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create pool");
      router.push(`/rooms/${data.roomId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-copod-100 bg-white/70 px-3 py-1 text-xs font-semibold text-copod-700">
          <span className="h-1.5 w-1.5 rounded-full bg-copod-500" /> For compute hosts
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900">List your compute pool</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Sell idle capacity by the seat. Every member joins with a PayPal authorization hold, and the autonomous treasurer
          captures their metered usage straight to your PayPal account when they leave.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="glass-card space-y-8 rounded-2xl p-6 sm:p-8">
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Pool</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pool name">
                <input className={input} required minLength={3} maxLength={60} placeholder="e.g. Night-shift H100 Pool" value={f.name} onChange={set("name")} />
              </Field>
              <Field label="Category">
                <select className={input} value={f.category} onChange={set("category")}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Model">
                <select className={input} value={f.model} onChange={pickModel}>
                  {MODELS.map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Hardware">
                <input className={input} maxLength={40} value={f.hardware} onChange={set("hardware")} />
              </Field>
            </div>
            <Field label="Tagline" hint="Optional. Shown on the pool card.">
              <input className={input} maxLength={90} placeholder="Cheap overnight batch inference for startups" value={f.tagline} onChange={set("tagline")} />
            </Field>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Host &amp; payouts</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Host name">
                <input className={input} required minLength={2} maxLength={40} placeholder="Your company" value={f.hostName} onChange={set("hostName")} />
              </Field>
              <Field label="PayPal payee email" hint="Optional. A PayPal Business (sandbox) email that receives captures. Defaults to the platform account.">
                <input className={input} type="email" placeholder="host-business@example.com" value={f.hostPayeeEmail} onChange={set("hostPayeeEmail")} />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Economics</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Monthly cost (USD)">
                <input className={input} type="number" min={50} max={100000} step={1} value={f.monthlyCost} onChange={set("monthlyCost")} />
              </Field>
              <Field label="Seats">
                <input className={input} type="number" min={2} max={200} step={1} value={f.maxSeats} onChange={set("maxSeats")} />
              </Field>
              <Field label="Deposit hold (USD)" hint="Authorized, not charged.">
                <input className={input} type="number" min={5} max={500} step={1} value={f.depositAmount} onChange={set("depositAmount")} />
              </Field>
              <Field label="Input $ / 1M tokens">
                <input className={input} type="number" min={0.1} max={100} step={0.1} value={f.baseInputPricePerM} onChange={set("baseInputPricePerM")} />
              </Field>
              <Field label="Output $ / 1M tokens">
                <input className={input} type="number" min={0.1} max={300} step={0.1} value={f.baseOutputPricePerM} onChange={set("baseOutputPricePerM")} />
              </Field>
              <Field label="Capacity (tokens/sec)">
                <input className={input} type="number" min={50} max={20000} step={50} value={f.capacityTokensPerSec} onChange={set("capacityTokensPerSec")} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="glass-card rounded-2xl p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-copod-600">Preview</div>
            <div className="mt-2 text-lg font-bold text-slate-900">{f.name || "Your pool"}</div>
            <div className="text-sm text-slate-500">{f.hardware}</div>
            <dl className="num mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Cost per seat</dt><dd className="font-semibold text-slate-900">${perSeat.toFixed(2)}/mo</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Deposit hold</dt><dd className="font-semibold text-slate-900">${f.depositAmount}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Base price</dt><dd className="font-semibold text-slate-900">${f.baseInputPricePerM} / ${f.baseOutputPricePerM}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Agent price band</dt><dd className="font-semibold text-slate-900">0.6x - 1.4x</dd></div>
            </dl>
            <p className="mt-5 rounded-xl bg-copod-50 p-3 text-xs leading-relaxed text-copod-800">
              The Gemini treasurer reprices within the band, requests top-ups at 85% of a hold, and settles each member by partial capture.
            </p>
          </div>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="shimmer-btn w-full rounded-xl bg-copod-600 px-5 py-3.5 text-sm font-semibold text-white shadow-blue-glow transition hover:bg-copod-700 disabled:opacity-60"
          >
            {busy ? "Creating pool..." : "Create pool"}
          </button>
        </aside>
      </form>
    </main>
  );
}
