import type { Checkout } from "@moyapay/shared";
import { HORIZON_URL, NETWORK_PASSPHRASE, USDC_ISSUER } from "@/lib/config";

/** The landing page's "Try the checkout": a labelled preview that never touches a wallet. */
export function demoCheckout(status: Checkout["status"] = "PENDING"): Checkout {
  const now = Date.now();
  return {
    reference: "MP-7KQ2XF",
    status,
    merchant: { name: "Bisi's Bakery" },
    amount: "50.0000000",
    asset: { code: "USDC", issuer: USDC_ISSUER },
    destination: "GCX4UJZDEGXDNCF32EPF3DHODZDOCIS2JHTLGMXGEDN73U55XTPL7QPA",
    memo: "MP-7KQ2XF",
    description: "Wedding cake deposit (preview)",
    expiresAt: new Date(now + 23 * 3600_000).toISOString(),
    paidAt: status === "PAID" ? new Date(now).toISOString() : null,
    paidTxHash: null,
    failedReason: null,
    createdAt: new Date(now - 3600_000).toISOString(),
    lastPayment: null,
    network: { passphrase: NETWORK_PASSPHRASE, horizonUrl: HORIZON_URL },
    serverTime: new Date(now).toISOString(),
  };
}
