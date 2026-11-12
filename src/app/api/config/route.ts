import { paypalMock } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    paypalClientId: paypalMock() ? null : process.env.PAYPAL_CLIENT_ID,
    paypalMode: paypalMock() ? "mock" : process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
  });
}
