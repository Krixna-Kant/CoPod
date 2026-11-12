export type MemberStatus =
  | "pending_authorization"
  | "active"
  | "throttled"
  | "batch_paused"
  | "suspended"
  | "settling"
  | "settled";

export type AuthorizationStatus =
  | "CREATED"
  | "CAPTURED"
  | "PARTIALLY_CAPTURED"
  | "VOIDED"
  | "EXPIRED"
  | "DENIED";

export interface Room {
  id: string;
  name: string;
  model: string;
  upstreamModel?: string;
  category: string;
  tagline: string;
  hardware: string;
  hostName: string;
  hostPayeeEmail?: string;
  monthlyCost: number;
  maxSeats: number;
  depositAmount: number;
  currency: string;
  baseInputPricePerM: number;
  baseOutputPricePerM: number;
  inputPricePerM: number;
  outputPricePerM: number;
  priceFloorMultiplier: number;
  priceCeilingMultiplier: number;
  topUpThreshold: number;
  epochHours: number;
  capacityTokensPerSec: number;
  createdAt: number;
}

export interface Authorization {
  id: string;
  memberId: string;
  orderId: string;
  amount: number;
  capturedAmount: number;
  status: AuthorizationStatus;
  kind: "deposit" | "topup";
  createdAt: number;
  expiresHonorAt: number;
  simulated: boolean;
  mock: boolean;
}

export interface MemberPolicy {
  maxTokensCap?: number;
  reason?: string;
  setBy: "agent" | "guardrail" | "system";
  updatedAt: number;
}

export interface Member {
  id: string;
  roomId: string;
  name: string;
  email?: string;
  apiKey: string;
  status: MemberStatus;
  policy?: MemberPolicy;
  simulated: boolean;
  joinedAt: number;
  leftAt?: number;
  epochStartedAt: number;
  usage: {
    requests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    gpuMs: number;
    spend: number;
    cappedRequests: number;
    rejectedRequests: number;
  };
  reserved: number;
  pendingTopUp?: { amount: number; reason: string; requestedAt: number };
  settlement?: Settlement;
}

export interface Settlement {
  meteredSpend: number;
  credits: number;
  captureAmount: number;
  releasedAmount: number;
  captures: { authorizationId: string; captureId: string; amount: number; status: string }[];
  voids: { authorizationId: string; amount: number }[];
  receipt?: string;
  settledAt: number;
  settledBy: "agent" | "fallback";
}

export interface UsageEvent {
  id: string;
  memberId: string;
  roomId: string;
  at: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  gpuMs: number;
  cost: number;
  inputPricePerM: number;
  outputPricePerM: number;
  priority: "interactive" | "batch";
  outcome: "ok" | "capped" | "upstream_error" | "rejected";
  requestedMaxTokens?: number;
  grantedMaxTokens?: number;
  note?: string;
  simulated: boolean;
  backfill?: boolean;
}

export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  ok: boolean;
}

export interface AgentDecision {
  id: string;
  roomId: string;
  at: number;
  trigger: string;
  engine: "gemini" | "rules";
  model?: string;
  summary: string;
  actions: AgentAction[];
  durationMs: number;
  error?: string;
}

export interface PaymentEvent {
  id: string;
  roomId: string;
  memberId?: string;
  at: number;
  type:
    | "ORDER_CREATED"
    | "AUTHORIZED"
    | "CAPTURED"
    | "VOIDED"
    | "WEBHOOK"
    | "ERROR";
  amount?: number;
  paypalId?: string;
  detail: string;
  mock: boolean;
}

export interface PricePoint {
  at: number;
  utilization: number;
  inputPricePerM: number;
  outputPricePerM: number;
}

export interface Notice {
  id: string;
  roomId: string;
  at: number;
  memberId?: string;
  level: "info" | "warning" | "critical";
  message: string;
}

export type LoadMode = "auto" | "offpeak" | "peak";

export interface SimState {
  mode: LoadMode;
  syntheticTokensPerSec: number;
}
