import { getAnthropic, MODEL_FAST } from "./client";
import { prisma } from "../db";
import { normalizeMerchant } from "./merchant";

type Suggestion = { txId: string; categoryName: string; confidence: number };

export async function categorizeReviewTransactions() {
  const [txs, categories, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "REVIEW" },
      select: { id: true, description: true, merchantRaw: true, amount: true, date: true },
      take: 100,
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
    prisma.merchantRule.findMany(),
  ]);

  if (txs.length === 0) {
    return { applied: 0, fromRules: 0, fromAI: 0, suggestions: [] as Suggestion[] };
  }

  const ruleMap = new Map(rules.map((r) => [r.pattern, r]));
  const catByName = new Map(categories.map((c) => [c.name, c]));

  // Pass 1: apply existing rules
  let fromRules = 0;
  const remaining: typeof txs = [];
  for (const t of txs) {
    const pattern = normalizeMerchant(t.merchantRaw ?? t.description);
    const rule = pattern ? ruleMap.get(pattern) : undefined;
    if (rule) {
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: t.id },
          data: { categoryId: rule.categoryId, status: "POSTED" },
        }),
        prisma.merchantRule.update({
          where: { id: rule.id },
          data: { hits: { increment: 1 } },
        }),
      ]);
      fromRules++;
    } else {
      remaining.push(t);
    }
  }

  if (remaining.length === 0) {
    return { applied: fromRules, fromRules, fromAI: 0, suggestions: [] as Suggestion[] };
  }

  // Pass 2: AI classify the rest
  const categoryList = categories
    .map((c) => `- ${c.name}${c.group ? ` (${c.group})` : ""}`)
    .join("\n");

  const txList = remaining
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
        content: `Classifique estas ${remaining.length} transações:\n\n${txList}\n\nResponda apenas o JSON.`,
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

  let fromAI = 0;
  // Build txId -> tx map for merchant lookup
  const txById = new Map(remaining.map((t) => [t.id, t]));
  for (const s of parsed.suggestions) {
    const cat = catByName.get(s.categoryName);
    if (!cat) continue;
    if (s.confidence < 0.6) continue;
    const tx = txById.get(s.txId);
    if (!tx) continue;

    await prisma.transaction.update({
      where: { id: s.txId },
      data: { categoryId: cat.id, status: "POSTED" },
    });
    fromAI++;

    // Cache rule for future tx
    const pattern = normalizeMerchant(tx.merchantRaw ?? tx.description);
    if (pattern && s.confidence >= 0.8) {
      await prisma.merchantRule.upsert({
        where: { pattern },
        create: {
          pattern,
          categoryId: cat.id,
          confidence: s.confidence,
          source: "AI",
          hits: 1,
        },
        update: {
          // Only update if new confidence higher AND source is AI (don't overwrite USER rules)
          categoryId: cat.id,
          confidence: s.confidence,
        },
      });
    }
  }

  return {
    applied: fromRules + fromAI,
    fromRules,
    fromAI,
    suggestions: parsed.suggestions,
    usage: {
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
      cacheRead: resp.usage.cache_read_input_tokens ?? 0,
      cacheCreation: resp.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
