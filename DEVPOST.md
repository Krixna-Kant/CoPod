## Inspiration

I wanted to run an open model on dedicated GPUs — no rate limits, no throttling at peak hours. Then I saw the price: a dedicated cluster starts around **$1,200 a month**, with long commitments. For one developer, that's impossible.

But I wasn't alone. Thousands of solo developers and small startups are stuck on rate-limited public APIs, while the teams that *do* rent clusters leave 50–70% of that capacity idle overnight. The obvious answer is to share. So why doesn't anyone?

Because sharing compute with strangers needs **trust**. Who pays for what? What if someone overspends? Who settles the bill at the end? I realized PayPal already has the perfect primitive for this — **authorize now, capture later** — and that an AI agent could run the books. That became CoPod.

## What it does

CoPod lets developers pool dedicated AI compute, with PayPal as the escrow and an autonomous AI as the treasurer.

1. **Hosts list a pool** — model, seats, deposit, prices, and the PayPal account that gets paid.
2. **Developers join with a PayPal authorization hold** (Orders API, `intent: AUTHORIZE`). Nothing is charged — the money stays theirs until they use the cluster.
3. **They get an OpenAI-compatible API key.** Every request is metered against their hold in real time.
4. **A guardrail makes overdraft impossible.** Before a prompt reaches the GPU, CoPod reserves the worst case and caps `max_tokens` to what the remaining hold can pay for:

$$
\text{max\_tokens}_{\text{granted}} = \min\left(\text{max\_tokens}_{\text{requested}},\ \left\lfloor \frac{H - S - R - c_{\text{in}}}{p_{\text{out}}} \right\rfloor \right)
$$

where $H$ is the hold, $S$ the metered spend, $R$ in-flight reservations, $c_{\text{in}}$ the estimated input cost and $p_{\text{out}}$ the output price per token.

5. **A Gemini treasurer runs the room autonomously.** It reads utilization, burn rates and runways, then acts through guarded tools: it discounts when the cluster is idle, raises prices at peak, throttles or batch-pauses heavy users, requests top-ups at 85% of a hold, and verifies authorizations with PayPal — explaining every decision.
6. **Exact settlement.** When a member leaves, the treasurer partially captures precisely what they used with `final_capture: true`, and PayPal releases the rest:

$$
\text{capture} = S, \qquad \text{released} = H - S
$$

7. **A live AG Grid ledger** streams every hold, spend, burn rate, capture and release in real time.

## How we built it

- **Next.js 16 + React 19 + TypeScript** as a single full-stack app: UI, API routes, the OpenAI-compatible proxy (`/v1/chat/completions`), and a background room engine that ticks every 2 seconds.
- **PayPal Orders v2 + Payments v2**: create order (AUTHORIZE) → authorize → verify → partial capture with `final_capture: true` → void unused authorizations, plus webhooks with signature verification. Every mutating call uses `PayPal-Request-Id` for idempotency, and 48-hour settlement epochs keep captures inside PayPal's 3-day honor period. The PayPal JS SDK handles buyer approval.
- **Google Gemini** (function calling) powers the treasurer with 8 typed tools. Each tool enforces hard limits in code: prices stay within $0.6\times$–$1.4\times$ of base and move at most 30% per step, and settlement must satisfy $0.8\,S \le \text{capture} \le S$ (any credit needs a written reason).
- **Groq** serves the models behind the proxy (`gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`).
- **AG Grid** for the live escrow ledger, payment events and guardrail log, streamed over **Server-Sent Events**.
- **Tailwind CSS v4** for the glassmorphism design, **Render** for hosting, and a **Postman** collection that runs the full lifecycle.

## Challenges we ran into

- **Money must never be wrong, even if the AI is.** I couldn't let a language model touch PayPal directly. The answer was guarded tools with server-side limits, a model fallback chain (`gemini-3.5-flash` → `gemini-2.5-flash` → `flash-lite`), and a deterministic rules engine so settlement always completes.
- **Partial capture semantics.** Settling across multiple authorizations (deposit + top-ups) meant capturing oldest-first with `final_capture: true` and voiding any authorization that receives nothing.
- **Reasoning models eat tokens.** The `gpt-oss` models spend part of `max_tokens` on hidden reasoning, which returned empty answers under tight guardrail caps. Tuning `reasoning_effort` per model fixed it.
- **Model churn mid-hackathon.** The model I started with was deprecated and my first Gemini model was overloaded, so I rebuilt the pools on currently served models and added automatic fallback.
- **Separating simulated load from real usage**, so demo traffic never distorts the utilization the agent prices on.

## Accomplishments that we're proud of

- A **real end-to-end PayPal lifecycle** in sandbox: authorization hold → metered usage → AI-driven partial capture → automatic release.
- **Zero-overdraft guarantee** enforced before every single request.
- An AI agent that is **genuinely autonomous but provably safe** — every action is bounded, logged and explained.
- A **two-sided marketplace**: anyone can host a pool and get paid directly.
- It's a drop-in OpenAI endpoint — developers change one line of code.

## What we learned

- PayPal's **authorize-and-capture** flow is far more powerful than a checkout button — it's a programmable escrow.
- The right way to give an AI agent financial power is **narrow tools with hard limits**, not open-ended access.
- Idempotency keys, honor periods and partial captures are what make payment systems trustworthy in practice.
- Designing for failure — fallback models, rules engines, atomic state writes — matters as much as the happy path.

## What's next for CoPod

- **Real GPU backends** (vLLM, provisioned throughput) behind the same metering and escrow layer.
- **Verified host onboarding** through PayPal partner referrals, so payouts go straight to verified accounts.
- **PayPal Vault** for returning members and recurring pools, plus multi-currency pools.
- **Agent-to-agent commerce**: autonomous AI clients that discover a pool, authorize a hold and buy compute on their own.
