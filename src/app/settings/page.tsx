import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { getSetupStatus } from "@/lib/infra/settings";
import { AiForm, PluggyForm, SourceBadge } from "@/components/setup/credential-forms";
import { TestSettingsButton } from "@/components/setup/test-settings-button";

export default async function SettingsPage() {
  const status = await getSetupStatus();
  return (
    <>
      <PageHeader title="Configurações" subtitle="Credenciais da Pluggy e da IA" actions={<TestSettingsButton />} />

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
