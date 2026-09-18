/** Input style for forms in dialogs (inputs, selects). */
export const INPUT_CLASS = "w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none";

/** A labeled form field. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
