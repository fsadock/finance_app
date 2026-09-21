"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** Short status message pinned under the phone's top bar; hides itself after `ms`. */
export function Toast({ message, onDone, ms = 4000, className }: { message: string; onDone: () => void; ms?: number; className?: string }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, ms, onDone]);
  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-4 z-50 mx-auto max-w-sm rounded-xl border border-border bg-bg-card px-4 py-2.5 text-center text-sm shadow-lg",
        "top-[calc(env(safe-area-inset-top)+3.5rem)]",
        className
      )}
    >
      {message}
    </div>
  );
}
