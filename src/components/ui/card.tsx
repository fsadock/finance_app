import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-bg-card p-6",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-sm font-medium text-fg-muted", className)} {...props} />;
}

export function CardValue({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-2xl font-semibold tracking-tight sm:text-3xl", className)} {...props} />;
}
