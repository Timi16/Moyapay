"use client";

import type { ErrorCode } from "@moyapay/shared";

/** Everything goes to /api/v1 on this origin; next.config.ts proxies it to the API. */
export const API = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't reach MoyaPay. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code: ErrorCode; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "INTERNAL", body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** SWR fetcher. */
export const fetcher = <T,>(path: string) => api<T>(path);

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
