import { cn } from "@/lib/utils";

/**
 * A row of the phone lists that replace tables: title and a detail line on the left, the value on
 * the right. Use inside <MobileList>.
 */
export function ListRow({
  title,
  meta,
  value,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-sm">{title}</div>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">{meta}</div>}
      </div>
      {value !== undefined && <div className="shrink-0 text-right text-sm font-medium tabular-nums">{value}</div>}
    </li>
  );
}

/** Phone-only list (tables take over from md up). */
export function MobileList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border md:hidden", className)}>{children}</ul>;
}
