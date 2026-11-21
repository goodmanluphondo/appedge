"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

const CONFIRMATION_MILLISECONDS = 1400;

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), CONFIRMATION_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return <button type="button" className="icon-action" onClick={copyValue} aria-label={copied ? "Copied" : label} title={copied ? "Copied" : label}><Icon name={copied ? "check" : "copy"} size={15}/></button>;
}
