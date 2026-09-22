import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { logSetupCode } from "@/lib/auth/enrollment";
import { currentSession } from "@/lib/auth/session";
import { hasPasskeys } from "@/lib/data/devices";

export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  const registered = await hasPasskeys();
  if (!registered) logSetupCode();
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-bg-card p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-2xl font-bold text-bg">F</div>
          <div>
            <h1 className="text-lg font-semibold">Finanças</h1>
            <p className="text-sm text-fg-muted">{registered ? "Entre com Face ID, Touch ID ou o PIN do dispositivo." : "Crie a passkey deste dispositivo."}</p>
          </div>
        </div>
        <LoginForm hasPasskeys={registered} />
      </div>
    </div>
  );
}
