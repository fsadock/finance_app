import { cn } from "@/lib/utils";

/** Pulsing placeholder shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-bg-hover", className)} />;
}
