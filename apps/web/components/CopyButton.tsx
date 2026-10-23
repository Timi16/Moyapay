"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A button that copies `text` and says "Copied" for a moment. */
export function CopyButton({
  text,
  label = "Copy",
  className = "btn alt",
  style,
  iconOnly,
  ariaLabel,
}: {
  text: string;
  label?: ReactNode;
  className?: string;
  style?: CSSProperties;
  iconOnly?: boolean;
  ariaLabel?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : "Copy")}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {iconOnly ? <Icon name={done ? "check" : "copy"} size={16} stroke={2.2} /> : done ? "Copied" : label}
    </button>
  );
}
