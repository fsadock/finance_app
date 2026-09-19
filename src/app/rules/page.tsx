import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { getRules } from "@/lib/data/rules";
import { getCategoryOptions } from "@/lib/data/categories";
import { Search } from "lucide-react";
import { RuleList } from "@/components/rules/rule-list";
import { ReclassifyPanel } from "@/components/rules/reclassify-panel";
import { getReclassifyBackupInfo } from "@/lib/jobs/reclassify";

type Props = { searchParams: Promise<{ q?: string; source?: string }> };

export default async function RulesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const source = sp.source === "AI" || sp.source === "USER" ? sp.source : undefined;

  const [{ rules, count }, categories] = await Promise.all([getRules({ q, source }), getCategoryOptions()]);
  const backup = await getReclassifyBackupInfo();

  return (
    <>
      <PageHeader
        title="Regras de categorização"
        subtitle={`${count("USER")} suas · ${count("AI")} aprendidas pela IA · aplicadas antes da IA em cada sincronização`}
      />

      <Card className="mb-6 p-4">
        <form className="flex flex-wrap gap-3 items-center text-sm">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Buscar comerciante…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
            />
          </div>
          <select name="source" defaultValue={source ?? ""} className="px-3 py-2 rounded-lg bg-bg-elev border border-border outline-none">
            <option value="">Todas as origens</option>
            <option value="USER">Suas escolhas</option>
            <option value="AI">IA</option>
          </select>
          <button className="px-4 py-2 rounded-lg bg-accent text-bg font-medium hover:bg-accent-hover">Filtrar</button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <RuleList rules={rules} categories={categories} />
        {rules.length === 0 && (
          <div className="p-12 text-center text-fg-muted">
            Nenhuma regra ainda. Elas são criadas quando você escolhe uma categoria ou a IA classifica com alta confiança.
          </div>
        )}
      </Card>
      <ReclassifyPanel backup={backup} />
    </>
  );
}
