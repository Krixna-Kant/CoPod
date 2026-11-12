"use client";

import { useEffect, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { post } from "./useRoom";

type Config = { paypalClientId: string | null; paypalMode: string };

let configPromise: Promise<Config> | null = null;
const loadConfig = () => (configPromise ??= fetch("/api/config").then((r) => r.json()));

export function PayButton({
  memberId,
  kind,
  amount,
  onAuthorized,
}: {
  memberId: string;
  kind: "deposit" | "topup";
  amount: number;
  onAuthorized: (r: { apiKey: string; authorizationId: string }) => void;
}) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadConfig().then(setCfg);
  }, []);

  const authorize = async (orderId: string) => {
    const r = await post<{ apiKey: string; authorizationId: string }>(`/api/paypal/orders/${orderId}/authorize`, { memberId, kind });
    onAuthorized(r);
  };

  if (!cfg) return <div className="h-11 animate-pulse rounded-lg bg-slate-100" />;

  if (!cfg.paypalClientId) {
    return (
      <div className="space-y-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const o = await post<{ orderId: string }>("/api/paypal/orders", { memberId, kind });
              await authorize(o.orderId);
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-lg bg-[#ffc439] px-4 py-2.5 text-sm font-semibold text-slate-900 hover:brightness-95 disabled:opacity-60"
        >
          {busy ? "Authorizing..." : `Authorize $${amount.toFixed(2)} hold (mock PayPal)`}
        </button>
        <p className="text-[11px] text-amber-600">PayPal credentials not configured: running in mock mode.</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PayPalScriptProvider options={{ clientId: cfg.paypalClientId, intent: "authorize", currency: "USD", components: "buttons" }}>
        <PayPalButtons
          style={{ layout: "horizontal", color: "gold", shape: "rect", label: "paypal", height: 42, tagline: false }}
          createOrder={async () => {
            setErr(null);
            const o = await post<{ orderId: string }>("/api/paypal/orders", { memberId, kind });
            return o.orderId;
          }}
          onApprove={async (data) => {
            try {
              await authorize(data.orderID);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          onError={(e) => setErr(String((e as { message?: string })?.message ?? e))}
        />
      </PayPalScriptProvider>
      <p className="text-[11px] text-slate-500">
        PayPal {cfg.paypalMode} - intent AUTHORIZE: ${amount.toFixed(2)} is held, not charged.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
