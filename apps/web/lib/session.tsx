"use client";

import type { Merchant } from "@moyapay/shared";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { ApiError, fetcher } from "./api";

interface Session {
  merchant: Merchant;
  refresh: KeyedMutator<{ merchant: Merchant }>;
}

const SessionContext = createContext<Session | null>(null);

/** Loads the signed-in merchant; sends anyone without a session to /signin. */
export function SessionGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, mutate } = useSWR<{ merchant: Merchant }>("/auth/me", fetcher, { shouldRetryOnError: false });
  const unauthenticated = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, router, pathname]);

  if (error && !unauthenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16, textAlign: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 800 }}>Couldn't reach MoyaPay</span>
        <span style={{ fontSize: 14, color: "#5B5876" }}>{error instanceof Error ? error.message : "Something went wrong"}</span>
        <button type="button" className="btn" onClick={() => void mutate()}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <>{fallback}</>;
  return <SessionContext.Provider value={{ merchant: data.merchant, refresh: mutate }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionGate");
  return s;
}
