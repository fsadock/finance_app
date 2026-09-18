import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** An error's message; for non-Error values, `fallback` (default: the value as text). */
export function errorMessage(e: unknown, fallback?: string) {
  return e instanceof Error ? e.message : (fallback ?? String(e));
}
