import { db, commit, logPayment } from "@/lib/store";
import { verifyWebhook } from "@/lib/paypal";

interface WebhookEvent {
  id: string;
  event_type: string;
  summary?: string;
  resource?: { id?: string; custom_id?: string; amount?: { value?: string }; supplementary_data?: { related_ids?: { authorization_id?: string } } };
}

export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as WebhookEvent | null;
  if (!event?.event_type) return Response.json({ error: "bad event" }, { status: 400 });

  let verified = false;
  try {
    verified = await verifyWebhook(req.headers, event);
  } catch (err) {
    console.error("[webhook] verification error", err);
  }

  const authId = event.resource?.supplementary_data?.related_ids?.authorization_id ?? event.resource?.id;
  const auth = authId ? db().authorizations[authId] : undefined;
  const member = auth ? db().members[auth.memberId] : undefined;
  const roomId = member?.roomId ?? Object.keys(db().rooms)[0];

  logPayment({
    roomId,
    memberId: member?.id,
    type: "WEBHOOK",
    amount: event.resource?.amount?.value ? Number(event.resource.amount.value) : undefined,
    paypalId: event.resource?.id,
    detail: `${event.event_type}${verified ? " (signature verified)" : " (unverified)"}${event.summary ? ` - ${event.summary}` : ""}`,
    mock: false,
  });
  if (verified && auth && event.event_type === "PAYMENT.AUTHORIZATION.VOIDED") auth.status = "VOIDED";
  commit();
  return Response.json({ ok: true });
}
