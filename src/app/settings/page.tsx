import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { getSetupStatus } from "@/lib/infra/settings";
import { AiForm, EmailForm, PluggyForm, SourceBadge } from "@/components/setup/credential-forms";
import { TestSettingsButton } from "@/components/setup/test-settings-button";
import { Devices } from "@/components/auth/devices";
import { getDevices } from "@/lib/data/devices";
import { currentSession } from "@/lib/auth/session";

export default async function SettingsPage() {
  const [status, session] = await Promise.all([getSetupStatus(), currentSession()]);
  const devices = await getDevices(session?.passkeyId);
  return (
    <>
      <PageHeader title="Configurações" subtitle="Credenciais e dispositivos" actions={<TestSettingsButton />} />

      <div className="max-w-2xl space-y-4">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Pluggy (Open Finance)</h2>
            <span className="flex items-center gap-2 text-xs">
              <SourceBadge source={status.pluggy.source} />
              <span className={status.pluggy.configured ? "text-accent" : "text-danger"}>
                {status.pluggy.configured ? "Configurada" : "Não configurada"}
              </span>
            </span>
          </div>
          <PluggyForm status={status.pluggy} />
          <p className="text-xs text-fg-muted">
            {status.connections} conexão(ões) de banco. Para conectar ou reconectar bancos, use{" "}
            <Link href="/accounts" className="text-accent hover:underline">Contas</Link>.
          </p>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">IA — Anthropic (opcional)</h2>
            <span className="flex items-center gap-2 text-xs">
              <SourceBadge source={status.ai.source} />
              <span className={status.ai.configured ? "text-accent" : "text-fg-muted"}>
                {status.ai.configured ? "Configurada" : "Desligada"}
              </span>
            </span>
          </div>
          <AiForm status={status.ai} />
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Entrar por e-mail</h2>
              <p className="text-xs text-fg-muted">Recebe o código de acesso quando nenhum dispositivo está à mão.</p>
            </div>
            <span className="flex items-center gap-2 text-xs">
              <SourceBadge source={status.email.source} />
              <span className={status.email.configured ? "text-accent" : "text-fg-muted"}>
                {status.email.configured ? "Configurado" : "Desligado"}
              </span>
            </span>
          </div>
          <EmailForm status={status.email} />
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Dispositivos</h2>
            <p className="text-xs text-fg-muted">Cada dispositivo entra com a própria passkey (Face ID, Touch ID ou PIN).</p>
          </div>
          <Devices devices={devices} />
        </Card>

        <Card className="text-sm text-fg-muted space-y-2">
          <h2 className="font-semibold text-fg">Onde isso fica salvo</h2>
          <p>
            As credenciais salvas aqui ficam no banco de dados local do app (<code>prisma/dev.db</code>), só neste computador. Valores
            salvos aqui têm prioridade sobre o arquivo <code>.env</code>.
          </p>
          <p>
            <strong className="text-fg">Atenção:</strong> um backup do banco de dados também contém essas chaves — guarde os backups em
            local seguro e não os compartilhe.
          </p>
        </Card>
      </div>
    </>
  );
}
