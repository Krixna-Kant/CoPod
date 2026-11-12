import crypto from "node:crypto";

const BASE =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const paypalMock = () => !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;

let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`OAuth failed (${res.status})`, await res.text(), res.status);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export class PayPalError extends Error {
  constructor(message: string, public body: string, public status: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `PayPal ${method} ${path} failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg += `: ${j.details?.[0]?.issue ?? j.name ?? ""} ${j.details?.[0]?.description ?? j.message ?? ""}`.trimEnd();
    } catch {}
    throw new PayPalError(msg, text, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const money = (n: number) => n.toFixed(2);
const fakeId = (p: string) => `${p}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

export async function createAuthorizeOrder(opts: {
  amount: number;
  currency: string;
  memberId: string;
  description: string;
  payeeEmail?: string;
}): Promise<{ id: string; status: string }> {
  if (paypalMock()) return { id: fakeId("MOCK-ORDER-"), status: "CREATED" };
  return call("POST", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: opts.memberId,
        custom_id: opts.memberId,
        description: opts.description.slice(0, 127),
        soft_descriptor: "COPOD COMPUTE",
        amount: { currency_code: opts.currency, value: money(opts.amount) },
        ...(opts.payeeEmail ? { payee: { email_address: opts.payeeEmail } } : {}),
      },
    ],
  }, `order-${opts.memberId}-${Date.now()}`);
}

interface AuthorizeResponse {
  id: string;
  status: string;
  purchase_units: {
    payments: {
      authorizations: { id: string; status: string; amount: { value: string }; expiration_time?: string }[];
    };
  }[];
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
}

export async function authorizeOrder(orderId: string, mockAmount: number) {
  if (paypalMock()) {
    return { authorizationId: fakeId("MOCK-AUTH-"), status: "CREATED", amount: mockAmount, payerEmail: undefined };
  }
  const r = await call<AuthorizeResponse>("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, `auth-${orderId}`);
  const auth = r.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new PayPalError("Authorization missing in PayPal response", JSON.stringify(r), 500);
  return {
    authorizationId: auth.id,
    status: auth.status,
    amount: Number(auth.amount.value),
    payerEmail: r.payer?.email_address,
  };
}

export async function captureAuthorization(opts: {
  authorizationId: string;
  amount: number;
  currency: string;
  finalCapture: boolean;
  invoiceId: string;
  note: string;
  mock: boolean;
}): Promise<{ id: string; status: string }> {
  if (opts.mock || paypalMock()) return { id: fakeId("MOCK-CAP-"), status: "COMPLETED" };
  return call("POST", `/v2/payments/authorizations/${opts.authorizationId}/capture`, {
    amount: { currency_code: opts.currency, value: money(opts.amount) },
    final_capture: opts.finalCapture,
    invoice_id: opts.invoiceId,
    note_to_payer: opts.note.slice(0, 255),
    soft_descriptor: "COPOD COMPUTE",
  }, `cap-${opts.invoiceId}`);
}

export async function voidAuthorization(authorizationId: string, mock: boolean) {
  if (mock || paypalMock()) return { status: "VOIDED" };
  await call("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, `void-${authorizationId}`);
  return { status: "VOIDED" };
}

export async function getAuthorization(authorizationId: string, mock: boolean) {
  if (mock || paypalMock()) return { id: authorizationId, status: "CREATED", mock: true };
  return call<Record<string, unknown>>("GET", `/v2/payments/authorizations/${authorizationId}`);
}

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || paypalMock()) return false;
  const r = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  });
  return r.verification_status === "SUCCESS";
}
