"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/infra/db";
import { CHAIN_LABEL, detectChain, shortAddress } from "@/lib/domain/crypto";
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

/** What the owner paid for an asset: it isn't on the chain, so it's typed once and kept across syncs. */
export async function setCryptoCostBasis(investmentId: string, costBasis: number): Promise<Result> {
  const id = z.string().min(1).parse(investmentId);
  const value = z.number().min(0).parse(costBasis);
  await prisma.investment.update({ where: { id }, data: { costBasis: value } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Custo salvo." };
}
