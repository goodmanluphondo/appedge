"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className="modal-submit" disabled={pending} onClick={() => startTransition(() => router.refresh())}>Try again</button>;
}
