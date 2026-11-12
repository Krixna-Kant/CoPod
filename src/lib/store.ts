import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AgentDecision,
  Authorization,
  Member,
  Notice,
  PaymentEvent,
  PricePoint,
  Room,
  SimState,
  UsageEvent,
} from "./types";

interface State {
  rooms: Record<string, Room>;
  members: Record<string, Member>;
  authorizations: Record<string, Authorization>;
  usage: UsageEvent[];
  decisions: AgentDecision[];
  payments: PaymentEvent[];
  prices: Record<string, PricePoint[]>;
  notices: Notice[];
  sim: Record<string, SimState>;
}

const LIMITS = { usage: 2000, decisions: 200, payments: 500, prices: 240, notices: 200 };
const DATA_FILE = path.join(process.cwd(), ".data", "state.json");

type Listener = () => void;

interface Runtime {
  state: State;
  listeners: Set<Listener>;
  saveTimer?: NodeJS.Timeout;
  notifyTimer?: NodeJS.Timeout;
}

const g = globalThis as unknown as { __copod?: Runtime };

function emptyState(): State {
  return {
    rooms: {},
    members: {},
    authorizations: {},
    usage: [],
    decisions: [],
    payments: [],
    prices: {},
    notices: [],
    sim: {},
  };
}

function load(): State {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return { ...emptyState(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
    }
  } catch (err) {
    console.error("[store] failed to load state, starting fresh", err);
  }
  return emptyState();
}

function runtime(): Runtime {
  if (!g.__copod) {
    g.__copod = { state: load(), listeners: new Set() };
  }
  return g.__copod;
}

export function db(): State {
  return runtime().state;
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function apiKey(): string {
  return `cp_live_${crypto.randomBytes(18).toString("base64url")}`;
}

function cap<T>(arr: T[], max: number) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function commit() {
  const rt = runtime();
  const s = rt.state;
  cap(s.usage, LIMITS.usage);
  cap(s.decisions, LIMITS.decisions);
  cap(s.payments, LIMITS.payments);
  cap(s.notices, LIMITS.notices);
  for (const k of Object.keys(s.prices)) cap(s.prices[k], LIMITS.prices);

  if (!rt.notifyTimer) {
    rt.notifyTimer = setTimeout(() => {
      rt.notifyTimer = undefined;
      for (const l of rt.listeners) {
        try {
          l();
        } catch {}
      }
    }, 150);
  }
  if (!rt.saveTimer) {
    rt.saveTimer = setTimeout(async () => {
      try {
        await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
        const tmp = `${DATA_FILE}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(rt.state));
        await fs.promises.rename(tmp, DATA_FILE);
      } catch (err) {
        console.error("[store] save failed", err);
      } finally {
        rt.saveTimer = undefined;
      }
    }, 10_000);
  }
}

export function subscribe(l: Listener): () => void {
  const rt = runtime();
  rt.listeners.add(l);
  return () => rt.listeners.delete(l);
}

export function resetState() {
  runtime().state = emptyState();
  commit();
}

export function membersOf(roomId: string): Member[] {
  return Object.values(db().members).filter((m) => m.roomId === roomId);
}

export function authorizationsOf(memberId: string): Authorization[] {
  return Object.values(db().authorizations)
    .filter((a) => a.memberId === memberId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function memberByKey(key: string): Member | undefined {
  return Object.values(db().members).find((m) => m.apiKey === key);
}

export function logPayment(e: Omit<PaymentEvent, "id" | "at">) {
  db().payments.push({ id: id("pay"), at: Date.now(), ...e });
}

export function notify(n: Omit<Notice, "id" | "at">) {
  db().notices.push({ id: id("ntc"), at: Date.now(), ...n });
}
