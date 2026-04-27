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
  return <div className={cn("mb-4 flex items-start justify-between gap-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-sm font-medium text-fg-muted", className)} {...props} />;
}

export function CardValue({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-3xl font-semibold tracking-tight", className)} {...props} />;
}
