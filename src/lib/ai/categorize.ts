import { getAnthropic, MODEL_FAST } from "./client";
import { prisma } from "../db";

type Suggestion = { txId: string; categoryName: string; confidence: number };

export async function categorizeReviewTransactions() {
  const [txs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "REVIEW" },
      select: { id: true, description: true, merchantRaw: true, amount: true, date: true },
      take: 50,
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
  ]);
  if (txs.length === 0) return { applied: 0, suggestions: [] as Suggestion[] };

  const categoryList = categories
    .map((c) => `- ${c.name}${c.group ? ` (${c.group})` : ""}`)
    .join("\n");

  const txList = txs
    .map((t, i) => `${i + 1}. id=${t.id} | "${t.description}" | ${t.amount.toFixed(2)} BRL | ${t.date.toISOString().slice(0, 10)}`)
    .join("\n");

  const client = getAnthropic();
  const resp = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text:
          "Você é um classificador de transações bancárias brasileiras. " +
          "Para cada transação, escolha a categoria mais apropriada da lista fornecida. " +
          "Considere comerciantes, padrões de descrição e valor típico no Brasil. " +
          "Responda APENAS com JSON válido no formato: " +
          `{"suggestions":[{"txId":"...","categoryName":"...","confidence":0.0-1.0}]}. ` +
          "Use exatamente o nome da categoria como aparece na lista. " +
          "Se não tiver certeza (<0.5 confidence), use \"Outros\".\n\n" +
          "Categorias disponíveis:\n" +
          categoryList,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Classifique estas ${txs.length} transações:\n\n${txList}\n\nResponda apenas o JSON.`,
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }
  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Invalid JSON from Claude: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]) as { suggestions: Suggestion[] };

  const catByName = new Map(categories.map((c) => [c.name, c]));
  let applied = 0;
  for (const s of parsed.suggestions) {
    const cat = catByName.get(s.categoryName);
    if (!cat) continue;
    if (s.confidence < 0.6) continue;
    await prisma.transaction.update({
      where: { id: s.txId },
      data: { categoryId: cat.id, status: "POSTED" },
    });
    applied++;
  }

  return {
    applied,
    suggestions: parsed.suggestions,
    usage: {
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
      cacheRead: resp.usage.cache_read_input_tokens ?? 0,
      cacheCreation: resp.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
