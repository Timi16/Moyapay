"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LogoTile } from "@/components/Logo";
import { SessionGate } from "@/lib/session";

function Loading() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <LogoTile size={36} />
      <span className="spin" aria-label="Loading" />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate fallback={<Loading />}>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
