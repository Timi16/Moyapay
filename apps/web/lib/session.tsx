"use client";

import type { Merchant } from "@moyapay/shared";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { fetcher } from "./api";

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
  // No working session, whatever the reason (signed out, expired, or the API unreachable):
  // send them to the wallet page, which explains what's wrong if it can't sign them in.
  const noSession = Boolean(error);

  useEffect(() => {
    if (noSession) router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
  }, [noSession, router, pathname]);

  if (!data) return <>{fallback}</>;
  return <SessionContext.Provider value={{ merchant: data.merchant, refresh: mutate }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionGate");
  return s;
}
