"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/infra/db";
import { averageCost, CHAIN_LABEL, detectChain, shortAddress } from "@/lib/domain/crypto";
import { dateOnly } from "@/lib/domain/format";
import { syncCryptoWallets } from "@/lib/jobs/crypto";

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Adds a watch-only wallet. Only the public address is stored — a seed phrase or private key would be both
 * useless here and dangerous, so the app never asks for one.
 */
export async function addCryptoWallet(address: string, label: string): Promise<Result> {
  const typed = z.string().min(20).max(120).parse(address).trim();
  const chain = detectChain(typed);
  if (!chain) return { ok: false, error: "Endereço não reconhecido como Bitcoin nem Solana. Confira se copiou inteiro." };
  if (/\s/.test(typed)) return { ok: false, error: "O endereço não pode ter espaços." };

  const existing = await prisma.cryptoWallet.findUnique({ where: { address: typed } });
  if (existing) return { ok: false, error: "Essa carteira já está cadastrada." };

  const name = z.string().max(40).parse(label).trim() || `${CHAIN_LABEL[chain]} ${shortAddress(typed)}`;
  const account = await prisma.account.create({
    data: { name, type: "INVESTMENT", institution: CHAIN_LABEL[chain], balance: 0 },
  });
  await prisma.cryptoWallet.create({ data: { chain, address: typed, label: name, accountId: account.id } });

  const { failed } = await syncCryptoWallets();
  revalidatePath("/", "layout");
  return failed > 0
    ? { ok: true, message: "Carteira cadastrada, mas a leitura do saldo falhou. Tente atualizar em instantes." }
    : { ok: true, message: `${name} cadastrada e lida.` };
}

/** Removes the wallet and the account holding its assets; nothing on-chain is touched. */
export async function removeCryptoWallet(id: string): Promise<Result> {
  const wallet = await prisma.cryptoWallet.findUnique({ where: { id: z.string().min(1).parse(id) } });
  if (!wallet) return { ok: false, error: "Carteira não encontrada." };
  await prisma.investment.deleteMany({ where: { accountId: wallet.accountId } });
  await prisma.account.delete({ where: { id: wallet.accountId } }); // cascades to the wallet
  revalidatePath("/", "layout");
  return { ok: true, message: `${wallet.label} removida.` };
}

export async function refreshCryptoWallets(): Promise<Result> {
  const { wallets, failed } = await syncCryptoWallets();
  revalidatePath("/", "layout");
  if (wallets === 0) return { ok: false, error: "Nenhuma carteira cadastrada." };
  return failed > 0
    ? { ok: false, error: `${failed} de ${wallets} carteira(s) não responderam. O saldo mostrado é o da última leitura.` }
    : { ok: true, message: "Saldos atualizados." };
}

/** One purchase of an asset: date, how much came in and what was paid. The cost is their weighted average. */
export async function addCryptoPurchase(input: { symbol: string; quantity: number; totalBrl: number; date: string }): Promise<Result> {
  const parsed = z
    .object({
      symbol: z.string().min(2).max(10),
      quantity: z.number().positive({ error: "Informe quanto você comprou." }),
      totalBrl: z.number().positive({ error: "Informe quanto você pagou." }),
      date: z.string().min(10),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { symbol, quantity, totalBrl, date } = parsed.data;
  await prisma.cryptoPurchase.create({
    data: {
      symbol,
      quantity,
      totalBrl,
      // "2026-08-02" lido como dia local: new Date() leria como UTC e mostraria o dia anterior aqui
      date: dateOnly(date),
    },
  });
  await refreshCostBasis(symbol);
  revalidatePath("/", "layout");
  return { ok: true, message: "Aporte registrado." };
}

export async function removeCryptoPurchase(id: string): Promise<Result> {
  const purchase = await prisma.cryptoPurchase.findUnique({ where: { id: z.string().min(1).parse(id) } });
  if (!purchase) return { ok: false, error: "Aporte não encontrado." };
  await prisma.cryptoPurchase.delete({ where: { id: purchase.id } });
  await refreshCostBasis(purchase.symbol);
  revalidatePath("/", "layout");
  return { ok: true, message: "Aporte removido." };
}

/** Keeps the stored investments in step with the purchases, so the Investimentos page shows the same cost. */
async function refreshCostBasis(symbol: string) {
  const { perUnit } = averageCost(await prisma.cryptoPurchase.findMany({ where: { symbol }, select: { quantity: true, totalBrl: true } }));
  await prisma.investment.updateMany({ where: { ticker: symbol, type: "CRYPTO" }, data: { costBasis: perUnit } });
}
