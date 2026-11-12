import Link from "next/link";

const sections = [
  { id: "quickstart", t: "Quickstart" },
  { id: "lifecycle", t: "Payment lifecycle" },
  { id: "proxy", t: "Proxy API" },
  { id: "guardrails", t: "Guardrails & errors" },
  { id: "agent", t: "Autonomous treasurer" },
];

function Code({ children }: { children: string }) {
  return <pre className="scroll-thin overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-[12.5px] leading-relaxed text-slate-200">{children}</pre>;
}

export default function Docs() {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm font-medium">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-copod-600">Documentation</div>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white hover:text-copod-600">
              {s.t}
            </a>
          ))}
        </nav>
      </aside>

      <article className="glass-card min-w-0 space-y-12 rounded-2xl p-6 text-slate-700 sm:p-10">
        <header>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">CoPod docs</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            CoPod is an OpenAI-compatible gateway in front of shared, dedicated model capacity. A PayPal authorization is your
            escrow, every request is metered against it, and an autonomous agent settles the exact amount when you leave.
          </p>
        </header>

        <section id="quickstart" className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Quickstart</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Open a room from <Link href="/#pools" className="font-semibold text-copod-600">Compute pools</Link> and enter your team name.
            </li>
            <li>Approve the deposit with PayPal. It is an authorization (a hold), not a charge.</li>
            <li>Copy your API key and point any OpenAI SDK at the CoPod base URL.</li>
          </ol>
          <Code>{`from openai import OpenAI

client = OpenAI(base_url="https://<your-copod-host>/v1", api_key="cp_live_...")
r = client.chat.completions.create(
    model="gpt-oss-120b",
    messages=[{"role": "user", "content": "Hello from a shared H100 pool"}],
    max_tokens=512,
    extra_headers={"x-copod-priority": "batch"},   # optional: interactive (default) or batch
)
print(r.choices[0].message.content, r.model_extra["copod"])`}</Code>
        </section>

        <section id="lifecycle" className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Payment lifecycle</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Join", "POST /v2/checkout/orders with intent AUTHORIZE, then POST /v2/checkout/orders/{id}/authorize. The authorization id is stored against your seat."],
              ["Top-up", "When the agent requests a top-up, you approve a second AUTHORIZE order. Settlement captures across all your authorizations, oldest first."],
              ["Settle", "POST /v2/payments/authorizations/{id}/capture with the exact amount and final_capture=true; any authorization that is not needed is voided."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-bold text-slate-900">{t}</div>
                <p className="mt-1 text-sm text-slate-600">{b}</p>
              </div>
            ))}
          </div>
          <p className="text-sm">
            Settlement runs when you leave, or automatically when a 48-hour epoch ends, which keeps every capture inside PayPal&apos;s
            3-day authorization honor period. PayPal webhooks are received at <code className="font-mono text-copod-700">/api/paypal/webhook</code> and
            verified with the verify-webhook-signature API.
          </p>
        </section>

        <section id="proxy" className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Proxy API</h2>
          <p className="text-sm">
            <code className="font-mono text-copod-700">POST /v1/chat/completions</code> and <code className="font-mono text-copod-700">GET /v1/models</code> follow the
            OpenAI schema. Streaming responses are supported. Every response carries metering details:
          </p>
          <Code>{`x-copod-cost-usd: 0.004387
x-copod-remaining-usd: 49.9956
x-copod-granted-max-tokens: 300
x-copod-price-per-m: 7.5/22.5

"copod": {
  "cost_usd": 0.004387,
  "remaining_hold_usd": 49.9956,
  "price_per_m": { "input": 7.5, "output": 22.5 },
  "max_tokens_requested": 300,
  "max_tokens_granted": 300,
  "guardrail": null
}`}</Code>
        </section>

        <section id="guardrails" className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Guardrails &amp; errors</h2>
          <p className="text-sm">
            Before a request is forwarded, CoPod estimates its input cost and reserves the worst case (input plus max_tokens of
            output) against your remaining hold. If it does not fit, max_tokens is lowered until it does; the reservation is
            released when the real usage is known, so concurrent requests cannot overspend. Failed upstream calls are never billed.
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
            {[
              ["402 insufficient_hold", "Your remaining hold cannot cover even a minimal response. Approve a top-up."],
              ["402 member_suspended", "The agent suspended the key because the hold is exhausted."],
              ["429 batch_paused", "Batch traffic is paused for your key; interactive requests still work."],
              ["401 invalid_api_key", "Unknown key, or the membership has been settled."],
            ].map(([c, d]) => (
              <div key={c} className="grid grid-cols-[200px_1fr] gap-4 border-b border-slate-100 px-4 py-2.5 last:border-0">
                <code className="font-mono text-xs font-semibold text-copod-700">{c}</code>
                <span className="text-slate-600">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="agent" className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Autonomous treasurer</h2>
          <p className="text-sm">
            A Gemini agent reviews each room periodically and whenever something happens: utilization crosses the idle (&lt;30%) or
            congested (&gt;85%) band, a member passes 85% of their hold, runway drops under 10 minutes, a hold is exhausted, or
            someone leaves. It receives a full room snapshot and acts through function calls:
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["set_room_price", "within 0.6x-1.4x of base, max 30% per step"],
              ["set_member_policy", "throttle, pause batch, suspend (only when hold < $0.05)"],
              ["request_top_up", "$10-$200 additional PayPal authorization"],
              ["verify_paypal_authorization", "live status from the Payments API"],
              ["settle_member", "capture <= metered spend, credits capped at 20% with a reason"],
              ["broadcast_notice", "in-app feed and optional webhook (Zapier, Slack)"],
            ].map(([t, d]) => (
              <div key={t} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <code className="font-mono text-xs font-semibold text-copod-700">{t}</code>
                <div className="text-xs text-slate-500">{d}</div>
              </div>
            ))}
          </div>
          <p className="text-sm">
            Limits are enforced in code, so the model can propose but never exceed them. If Gemini is unavailable, a deterministic
            rule engine takes over and is labelled as such in the decision log.
          </p>
        </section>
      </article>
    </main>
  );
}
