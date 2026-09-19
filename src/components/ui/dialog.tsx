"use client";

import { X } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Modal with a close button, a title and an optional description: a bottom sheet on phones, centered from sm up. */
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <Card className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-b-none p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-left sm:rounded-2xl sm:pb-6">
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
