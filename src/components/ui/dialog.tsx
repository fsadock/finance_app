"use client";

import { X } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Centered modal with a close button, a title and an optional description. */
export function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md p-6 relative text-left">
        <button onClick={onClose} className="absolute right-4 top-4 text-fg-muted hover:text-fg" aria-label="Fechar">
          <X className="size-5" />
        </button>
        <h2 className={description ? "text-xl font-bold mb-1" : "text-xl font-bold mb-6"}>{title}</h2>
        {description && <p className="text-sm text-fg-muted mb-6">{description}</p>}
        {children}
      </Card>
    </div>
  );
}
