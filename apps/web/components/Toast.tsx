"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "ok" | "bad" | "info";
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 50, display: "flex", flexDirection: "column", gap: 8, maxWidth: "calc(100vw - 40px)" }}>
        {items.map((t) => (
          <div
            key={t.id}
            className="pop"
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 700,
              color: "#FFFFFF",
              background: t.tone === "bad" ? "#B42318" : t.tone === "info" ? "#12102A" : "#067647",
              boxShadow: "0 16px 30px -16px rgba(18,16,42,.6)",
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
