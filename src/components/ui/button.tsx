import { cn } from "@/lib/utils";

const SIZES = {
  /** toolbar actions (e.g. "Conectar conta") */
  sm: "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium",
  /** form submits */
  md: "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
  /** full-width dialog submit */
  lg: "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors",
} as const;

/** Primary (accent) button. Spinners and labels are up to the caller. */
export function Button({
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: keyof typeof SIZES }) {
  return (
    <button
      {...props}
      className={cn(SIZES[size], "bg-accent text-bg hover:bg-accent-hover disabled:opacity-50", className)}
    />
  );
}
