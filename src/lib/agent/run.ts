import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { commit, db, id, membersOf } from "../store";
import { isLive, memberLedger, roomUtilization, round2 } from "../ledger";
import { declarations, execute } from "./tools";
import { roomSnapshot } from "./snapshot";
import type { AgentAction, AgentDecision } from "../types";

const MAX_STEPS = 8;

const SYSTEM = `You are the CoPod Treasurer, the autonomous financial operator of a shared dedicated-GPU compute room.
Developers join by placing a PayPal authorization hold (deposit). Their inference usage is metered per token against that hold.
At exit (or when the 48h epoch ends, inside PayPal's 3-day honor period) you settle by capturing exactly what they owe and releasing the rest.

Your objectives, in priority order:
1. Solvency: no member may spend beyond their PayPal authorization. Act before they run out (runway, hold_used_pct).
2. Accurate settlement: when leave_requested is true, settle that member in this run. Capture their metered spend. Only credit
   (capture less) when the activity log justifies it (e.g. many requests capped by the guardrail that degraded results, or a
   price spike they could not react to). Write a clear receipt with tokens, prices, captured and released amounts.
3. Healthy utilization: keep room utilization roughly in a 40-80% band using price. Below ~30% sustained -> discount (up to
   25% vs base) and broadcast an off-peak notice so members schedule batch work. Above ~85% -> raise price moderately and
   consider pausing batch traffic of the heaviest consumers. Return toward base price when utilization normalizes.
   Avoid flapping: do not reprice if you repriced within the last minute unless utilization crossed a band.
4. Low friction: prefer the least disruptive action. Request a top-up around the top-up threshold (85% of hold used) or when
   runway < 10 minutes; pause batch only if they are still burning fast; suspend only when the hold is effectively exhausted.
   Restore members to active once a top-up lands or risk subsides.

Rules: all money amounts are USD. Tools enforce hard limits; if a tool rejects an action, adapt rather than retry the same call.
If nothing needs to change, take no action. Simulated members are synthetic tenants; treat them like real members.
Finish with a 1-3 sentence plain-English summary of what you decided and why (mention numbers).`;

function client() {
  const key = process.env.GEMINI_API_KEY;
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

export const agentModel = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

export async function runAgent(roomId: string, trigger: string, leaving: string[] = []): Promise<AgentDecision> {
  const started = Date.now();
  const decision: AgentDecision = {
    id: id("dec"),
    roomId,
    at: started,
    trigger,
    engine: "gemini",
    model: agentModel(),
    summary: "",
    actions: [],
    durationMs: 0,
  };

  const ai = client();
  try {
    if (!ai) throw new Error("GEMINI_API_KEY not set");
    await geminiLoop(ai, roomId, trigger, leaving, decision);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (decision.actions.length === 0) {
      decision.engine = "rules";
      decision.model = undefined;
      decision.error = ai ? `Gemini unavailable (${msg.slice(0, 160)}); rule engine took over` : undefined;
      await rulesEngine(roomId, leaving, decision);
    } else {
      decision.error = msg.slice(0, 200);
    }
  }

  decision.durationMs = Date.now() - started;
  db().decisions.push(decision);
  commit();
  return decision;
}

async function geminiLoop(
  ai: GoogleGenAI,
  roomId: string,
  trigger: string,
  leaving: string[],
  decision: AgentDecision,
) {
  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: `Trigger: ${trigger}\n\nRoom snapshot:\n${JSON.stringify(roomSnapshot(roomId, leaving))}`,
        },
      ],
    },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ai.models.generateContent({
      model: agentModel(),
      contents,
      config: {
        systemInstruction: SYSTEM,
        tools: [{ functionDeclarations: declarations }],
        temperature: 0.2,
      },
    });
    const calls = res.functionCalls ?? [];
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    if (!calls.length) {
      decision.summary = (res.text ?? "").trim() || "No action needed.";
      return;
    }

    const responses: Part[] = [];
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      const result = await execute(roomId, call.name ?? "", args);
      const isRead = call.name === "get_room_snapshot" || call.name === "get_member_activity";
      decision.actions.push({
        tool: call.name ?? "",
        args,
        result: isRead ? { ok: result.ok, note: "read" } : result,
        ok: result.ok,
      });
      responses.push({ functionResponse: { id: call.id, name: call.name, response: result } });
    }
    contents.push({ role: "user", parts: responses });
  }
  decision.summary = decision.summary || "Reached step limit; actions above were applied.";
}

/** Deterministic policy used when Gemini is not configured or unavailable. */
async function rulesEngine(roomId: string, leaving: string[], decision: AgentDecision) {
  const room = db().rooms[roomId];
  const notes: string[] = [];
  const act = async (tool: string, args: Record<string, unknown>) => {
    const result = await execute(roomId, tool, args);
    decision.actions.push({ tool, args, result, ok: result.ok } as AgentAction);
    return result;
  };

  for (const mid of leaving) {
    const m = db().members[mid];
    if (!m || m.status === "settled") continue;
    const l = memberLedger(m);
    const amt = round2(m.usage.spend);
    await act("settle_member", {
      member_id: mid,
      capture_amount_usd: amt,
      receipt: `Usage: ${m.usage.inputTokens} input + ${m.usage.outputTokens} output tokens over ${m.usage.requests} requests. Captured $${amt.toFixed(2)} of $${l.hold.toFixed(2)} authorized; $${(l.hold - amt).toFixed(2)} released.`,
    });
    notes.push(`settled ${m.name} for $${amt.toFixed(2)}`);
  }

  const util = roomUtilization(room);
  const baseOut = room.baseOutputPricePerM;
  const target =
    util < 0.3 ? 0.75 : util > 0.85 ? 1.15 : Math.abs(room.outputPricePerM / baseOut - 1) > 0.01 ? 1 : null;
  if (target !== null && Math.abs(room.outputPricePerM - baseOut * target) > 0.01) {
    const current = room.outputPricePerM / baseOut;
    const next = Math.min(current * 1.29, Math.max(current * 0.71, target));
    const r = await act("set_room_price", {
      input_price_per_m: round2(room.baseInputPricePerM * next),
      output_price_per_m: round2(baseOut * next),
      reason: util < 0.3 ? "Idle capacity discount" : util > 0.85 ? "Peak congestion pricing" : "Utilization normalized",
    });
    if (r.ok) notes.push(`repriced to ${Math.round(next * 100)}% of base at ${Math.round(util * 100)}% utilization`);
    if (r.ok && util < 0.3) {
      await act("broadcast_notice", { level: "info", message: "Off-peak: 25% discount live. Good time for batch jobs." });
    }
  }

  for (const m of membersOf(roomId).filter((x) => isLive(x) || x.status === "suspended")) {
    if (leaving.includes(m.id)) continue;
    const l = memberLedger(m);
    const used = l.hold > 0 ? l.spend / l.hold : 0;
    if (used >= room.topUpThreshold && !m.pendingTopUp) {
      await act("request_top_up", { member_id: m.id, amount_usd: room.depositAmount, reason: `${Math.round(used * 100)}% of hold used` });
      notes.push(`requested top-up from ${m.name}`);
    }
    if (l.available < 0.05 && m.status !== "suspended") {
      await act("set_member_policy", { member_id: m.id, status: "suspended", reason: "Hold exhausted" });
    } else if (used >= room.topUpThreshold && m.status === "active" && l.batchShare5m > 0) {
      await act("set_member_policy", { member_id: m.id, status: "batch_paused", reason: "Hold above top-up threshold" });
    }
  }

  decision.summary = notes.length
    ? `Rule engine: ${notes.join("; ")}.`
    : `Rule engine: utilization ${Math.round(util * 100)}%, no changes needed.`;
}
