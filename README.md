# CoPod — Fractional AI Compute Escrow on PayPal

> Share a dedicated GPU pool with other teams. Pay only for the tokens you actually use. Every seat is a **PayPal authorization hold**, metered in real time and settled by an **autonomous Gemini treasurer**.

Built for the **PayPal AI Hackathon**.

## The problem

A dedicated inference cluster (e.g. 8× H100) costs more than most small AI teams can justify alone, and public APIs throttle at peak. Teams want to *pool* a cluster — but pooling compute between strangers needs trust: who pays for what, what if someone overspends, who settles at the end?

## The solution

CoPod turns PayPal's **authorize → capture** primitive into a programmable compute escrow:

1. **Join a pool** — the developer approves a PayPal order with `intent: AUTHORIZE`. Funds are held, not charged.
2. **Use the pool** — they get an OpenAI-compatible endpoint (`/v1/chat/completions`) and an API key. Every request is metered against their hold.
3. **Guardrail** — before forwarding, CoPod reserves the worst-case cost and caps `max_tokens` so spend can **never exceed the hold**.
4. **Autonomous treasurer (Gemini)** — an agent with function-calling tools watches the room and acts on its own:
   - **Dynamic pricing**: discounts when the cluster is idle (<30% utilization), raises prices at peak (>85%), within hard bounds (0.6×–1.4× base, ≤30% per step).
   - **Top-ups**: requests a new PayPal authorization when a member hits 85% of their hold.
   - **Policies**: throttles or batch-pauses heavy users at peak; suspends only when funds are exhausted.
   - **Verification**: checks authorization status directly with PayPal.
   - **Settlement**: on leave, **partially captures** exactly the metered spend with `final_capture: true` — the rest of the hold is released automatically to the payer.
5. **Live ledger** — an AG Grid escrow ledger streams holds, spend, captures and releases in real time.

## PayPal integration

| Step | API |
| --- | --- |
| Checkout | PayPal JS SDK (`@paypal/react-paypal-js`, `intent=authorize`) |
| Create hold | `POST /v2/checkout/orders` (intent `AUTHORIZE`) |
| Authorize | `POST /v2/checkout/orders/{id}/authorize` |
| Verify | `GET /v2/payments/authorizations/{id}` |
| Settle | `POST /v2/payments/authorizations/{id}/capture` with `final_capture: true` (partial capture) |
| Release unused | `POST /v2/payments/authorizations/{id}/void` |
| Events | Webhooks with `/v1/notifications/verify-webhook-signature` |

All mutating calls use `PayPal-Request-Id` for idempotency. Epochs are 48 h, inside PayPal's 3-day honor period.

## Agent safety

The agent can only act through 8 typed tools, and every tool enforces hard limits server-side — the model cannot capture more than metered spend, cannot capture less than 80% of it without a written credit reason, and cannot move prices outside the band. If Gemini is unavailable, a deterministic rules engine takes over so money always settles correctly. Every decision, tool call and result is logged in the dashboard.

## Architecture

```
Browser (Next.js UI, AG Grid, SSE)
   │                    ▲ live room state (SSE)
   ▼                    │
Next.js server ── engine (2s tick: load, triggers, epochs)
   │   ├─ /v1/chat/completions  → metering guardrail → Groq (gpt-oss-120b, qwen) / Gemini
   │   ├─ Gemini treasurer agent (function calling, fallback models, rules fallback)
   │   └─ PayPal REST (Orders v2, Payments v2, Webhooks)
   ▼
JSON state store (atomic writes)
```

## Tech stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**, **Tailwind CSS v4**
- **PayPal** Orders v2, Payments v2, Webhooks, JS SDK (sandbox)
- **Google Gemini** (`@google/genai`, function calling) — autonomous treasurer
- **Groq** — OpenAI-compatible inference upstream (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`)
- **AG Grid Community** — live escrow ledger

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
```

Required: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (sandbox app from developer.paypal.com), `GEMINI_API_KEY`, `GROQ_API_KEY`. Without PayPal keys the app runs in a clearly labelled mock mode.

Test with a **US Personal sandbox account** as the buyer, and check captures/releases on sandbox.paypal.com with the **Business sandbox account**.

### Use the pool from code

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:3000/v1", api_key="cp_live_...")
r = client.chat.completions.create(model="gpt-oss-120b", messages=[{"role": "user", "content": "Hello"}])
print(r.choices[0].message.content, r.copod)  # copod = metering + remaining hold
```

## License

[MIT](LICENSE)
