import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getRules } from "@/lib/data/rules";
import { getCategoryOptions } from "@/lib/data/categories";
import { Search, Sparkles, User } from "lucide-react";
import { RuleCategorySelect, DeleteRuleButton } from "@/components/rules/rule-row-actions";
import { ReclassifyPanel } from "@/components/rules/reclassify-panel";
import { getReclassifyBackupInfo } from "@/lib/jobs/reclassify";
import Link from "next/link";

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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-b border-border">
              <th className="px-6 py-3 font-medium">Padrão do comerciante</th>
              <th className="px-6 py-3 font-medium">Categoria</th>
              <th className="px-6 py-3 font-medium">Origem</th>
              <th className="px-6 py-3 font-medium text-right">Usos</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-bg-hover/40">
                <td className="px-6 py-2.5">
                  <Link href={`/transactions?q=${encodeURIComponent(r.pattern)}`} className="font-mono text-xs hover:text-accent">
                    {r.pattern}
                  </Link>
                </td>
                <td className="px-6 py-2.5">
                  <RuleCategorySelect id={r.id} categoryId={r.categoryId} categories={categories} />
                </td>
                <td className="px-6 py-2.5">
                  {r.source === "USER" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent"><User className="size-3" /> Você</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-info">
                      <Sparkles className="size-3" /> IA · {Math.round(r.confidence * 100)}%
                    </span>
                  )}
                </td>
                <td className="px-6 py-2.5 text-right text-fg-muted">{r.hits}</td>
                <td className="px-6 py-2.5 text-right">
                  <DeleteRuleButton id={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
