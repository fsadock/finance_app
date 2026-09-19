import Link from "next/link";
import { Sparkles, User } from "lucide-react";
import { ListRow, MobileList } from "@/components/ui/list-row";
import { DeleteRuleButton, RuleCategorySelect } from "@/components/rules/rule-row-actions";
import type { getRules } from "@/lib/data/rules";

type Rule = Awaited<ReturnType<typeof getRules>>["rules"][number];

function RuleSource({ r }: { r: Rule }) {
  return (
    <>
      {r.source === "USER" ? (
        <span className="inline-flex items-center gap-1 text-xs text-accent"><User className="size-3" /> Você</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-info">
          <Sparkles className="size-3" /> IA · {Math.round(r.confidence * 100)}%
        </span>
      )}
    </>
  );
}

function Pattern({ r }: { r: Rule }) {
  return (
    <Link href={`/transactions?q=${encodeURIComponent(r.pattern)}`} className="truncate font-mono text-xs hover:text-accent">
      {r.pattern}
    </Link>
  );
}

/** Merchant rules: a table from md up, a compact list on phones. */
export function RuleList({ rules, categories }: { rules: Rule[]; categories: { id: string; name: string }[] }) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
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
                <RuleSource r={r} />
              </td>
              <td className="px-6 py-2.5 text-right text-fg-muted">{r.hits}</td>
              <td className="px-6 py-2.5 text-right">
                <DeleteRuleButton id={r.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <MobileList>
        {rules.map((r) => (
          <ListRow
            key={r.id}
            title={<Pattern r={r} />}
            meta={
              <>
                <RuleCategorySelect id={r.id} categoryId={r.categoryId} categories={categories} />
                <RuleSource r={r} />
                <span>{r.hits} usos</span>
              </>
            }
            value={<DeleteRuleButton id={r.id} />}
          />
        ))}
      </MobileList>
    </>
  );
}
