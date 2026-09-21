"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/** Pulses its icon while the enclosing <Link> is navigating. Must be rendered inside the Link. */
export function NavLinkPending({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  return <span className={cn("inline-flex", pending && "animate-pulse text-accent", className)}>{children}</span>;
}
