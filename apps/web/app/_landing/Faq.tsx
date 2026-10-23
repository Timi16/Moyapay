"use client";

import { useState } from "react";

const QA: [string, string][] = [
  ["Does MoyaPay hold my money?", "Never. Payments go straight from your customer’s wallet to yours. We only watch the network and keep the records."],
  [
    "How does it know which payment is for which order?",
    "Every request gets its own reference, like MP-7KQ2XF. The checkout puts it in the payment memo for the customer, and we match on that plus the exact amount, coin and wallet.",
  ],
  [
    "What if someone pays the wrong amount, or pays twice?",
    "Nothing is marked Paid by mistake. The payment is flagged with the reason in Reconciliation, and you choose to assign it, refund it or ignore it.",
  ],
  [
    "Is this real money?",
    "Not yet. MoyaPay runs on Stellar Testnet, where USDC is free test money. Every payment is still a real transaction you can look up on Stellar Expert.",
  ],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <>
      {QA.map(([q, a], i) => {
        const o = open === i;
        return (
          <div className="fq" key={q}>
            <button type="button" aria-expanded={o} onClick={() => setOpen(o ? -1 : i)}>
              {q}
              <span
                className="pm"
                style={{ background: o ? "#5B3DF5" : "#F6F5FB", color: o ? "#FFFFFF" : "#12102A", transform: `rotate(${o ? "45deg" : "0deg"})` }}
              >
                +
              </span>
            </button>
            {o && <p>{a}</p>}
          </div>
        );
      })}
    </>
  );
}
