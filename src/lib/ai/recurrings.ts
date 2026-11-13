import { getAnthropic, MODEL_FAST } from "@/lib/ai/client";
import { withRetry } from "@/lib/infra/retry";
import { CADENCES, type RecurringCandidate } from "@/lib/domain/recurrence";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const SYSTEM_PROMPT = (categoryList: string) =>
  "Você analisa grupos de transações bancárias brasileiras para detectar lançamentos recorrentes: " +
  "assinaturas, contas fixas (aluguel, luz, internet, escola, seguros) e receitas recorrentes (salário, aluguel recebido). " +
  "NÃO são recorrentes, mesmo repetindo: compras em restaurante, delivery, mercado, posto, farmácia, loja ou " +
  "shopping; Pix para pessoas físicas (nome de gente no lugar do serviço); compras em marketplace (Amazon, " +
  "Mercado Livre). Recorrente é um contrato que cobra sozinho, sempre o mesmo valor aproximado, no mesmo " +
  "intervalo. Na dúvida, omita: uma recorrência errada atrapalha mais do que uma que falta. " +
  "Para cada candidato realmente recorrente, retorne: candidate = o número do candidato; name = nome amigável " +
  "do serviço ou conta; cadence; categoryName da lista (ou null); confidence entre 0 e 1. " +
  "Omita candidatos que não são recorrentes.\n\nCategorias disponíveis:\n" +
  categoryList;

/**
 * Asks Claude which candidates are real recurrings, with a name, cadence and category for each.
 * Only talks to the API: saving them is up to the caller (jobs/recurrings.ts).
 */
export async function suggestRecurrings(candidates: RecurringCandidate[], categories: { id: string; name: string }[]) {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const candidateText = candidates
    .map((c, i) => {
      const dates = c.samples.map((s) => s.date.toISOString().slice(0, 10)).join(", ");
      const sample = c.samples[c.samples.length - 1]!.description.slice(0, 80);
      const cat = c.samples.find((s) => s.categoryId)?.categoryId;
      return (
        `${i}. ${sample} | ${c.avgAmount < 0 ? "saída" : "entrada"} média ${Math.abs(c.avgAmount).toFixed(2)} | ` +
        `${c.samples.length} ocorrências em [${dates}] | cadência estimada: ${c.cadence} | ` +
        `categoria atual: ${cat ? catName.get(cat) : "sem categoria"}`
      );
    })
    .join("\n");

  const DetectedSchema = z.object({
    detected: z.array(
      z.object({
        candidate: z.number().int(),
        name: z.string(),
        cadence: z.enum(CADENCES),
        categoryName: z.enum(categories.map((c) => c.name) as [string, ...string[]]).nullable(),
        confidence: z.number(),
      })
    ),
  });

  const anthropic = await getAnthropic();
  const resp = await withRetry(() =>
    anthropic.messages.parse({
      model: MODEL_FAST,
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT(categories.map((c) => `- ${c.name}`).join("\n")),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Candidatos:\n\n${candidateText}` }],
      output_config: { format: zodOutputFormat(DetectedSchema) },
    })
  );
  const parsed = resp.parsed_output;
  if (!parsed) throw new Error(`Claude returned no parseable output (stop_reason=${resp.stop_reason})`);

  const usage = {
    input: resp.usage.input_tokens,
    output: resp.usage.output_tokens,
    cacheRead: resp.usage.cache_read_input_tokens ?? 0,
  };
  return { detected: parsed.detected, usage };
}
