import { getPluggy } from "./client";
import { prisma } from "../db";
import type { AccountType as PrismaAccountType, InvestmentType as PrismaInvestmentType } from "@/generated/prisma/client";

function mapAccountType(pluggyType: string, subtype: string | undefined | null): PrismaAccountType {
  if (subtype === "CREDIT_CARD" || pluggyType === "CREDIT") return "CREDIT_CARD";
  if (subtype === "SAVINGS_ACCOUNT") return "SAVINGS";
  if (subtype === "CHECKING_ACCOUNT") return "CHECKING";
  if (pluggyType === "INVESTMENT") return "INVESTMENT";
  if (pluggyType === "LOAN") return "LOAN";
  return "CHECKING";
}

function mapInvestmentType(pluggyType: string): PrismaInvestmentType {
  switch (pluggyType) {
    case "EQUITY":
      return "STOCK";
    case "ETF":
      return "ETF";
    case "FIXED_INCOME":
    case "TREASURY":
      return "FIXED_INCOME";
    case "MUTUAL_FUND":
      return "FUND";
    case "CRYPTO":
      return "CRYPTO";
    default:
      return "OTHER";
  }
}

export async function registerItem(itemId: string) {
  const pluggy = getPluggy();
  const item = await pluggy.fetchItem(itemId);
  await prisma.pluggyItem.upsert({
    where: { pluggyId: item.id },
    create: {
      pluggyId: item.id,
      connector: String(item.connector?.name ?? item.connector?.id ?? "unknown"),
      status: item.status,
      lastUpdated: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
    },
    update: {
      status: item.status,
      lastUpdated: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
    },
  });
  return item;
}

export async function syncItem(itemId: string) {
  const pluggy = getPluggy();
  const item = await registerItem(itemId);
  const institutionName = String(item.connector?.name ?? "Open Finance");

  const accountsPage = await pluggy.fetchAccounts(itemId);
  const stats = { accounts: 0, transactions: 0, investments: 0 };

  for (const a of accountsPage.results) {
    const mapped = mapAccountType(a.type, a.subtype);
    const balance = a.subtype === "CREDIT_CARD" ? -Math.abs(a.balance ?? 0) : a.balance ?? 0;

    const existing = await prisma.account.findFirst({ where: { pluggyItemId: item.id, name: a.name } });
    const acct = existing
      ? await prisma.account.update({
          where: { id: existing.id },
          data: { balance, type: mapped, institution: institutionName, currency: a.currencyCode ?? "BRL", creditLimit: a.creditData?.creditLimit ?? null },
        })
      : await prisma.account.create({
          data: {
            name: a.name || a.marketingName || "Conta",
            type: mapped,
            institution: institutionName,
            currency: a.currencyCode ?? "BRL",
            balance,
            creditLimit: a.creditData?.creditLimit ?? null,
            pluggyItemId: item.id,
          },
        });
    stats.accounts++;

    // Pull all available history (Pluggy returns whatever the bank provides; cap at 5 years back)
    const from = new Date();
    from.setFullYear(from.getFullYear() - 5);
    let page = 1;
    while (true) {
      const txs = await pluggy.fetchTransactions(a.id, { from: from.toISOString().slice(0, 10), pageSize: 200, page });
      for (const t of txs.results) {
        const exists = await prisma.transaction.findFirst({ where: { pluggyTxId: t.id } });
        if (exists) continue;
        await prisma.transaction.create({
          data: {
            accountId: acct.id,
            date: new Date(t.date),
            amount: t.amount,
            currency: t.currencyCode ?? "BRL",
            description: t.description || t.descriptionRaw || "Sem descrição",
            merchantRaw: t.descriptionRaw ?? null,
            status: "REVIEW",
            pluggyTxId: t.id,
          },
        });
        stats.transactions++;
      }
      if (page >= txs.totalPages || txs.results.length === 0) break;
      page++;
    }
  }

  // Investments
  try {
    const invPage = await pluggy.fetchInvestments(itemId);
    if (invPage.results.length > 0) {
      const invAccount = await prisma.account.upsert({
        where: { id: `inv-${itemId}` },
        create: { id: `inv-${itemId}`, name: `Investimentos ${institutionName}`, type: "INVESTMENT", institution: institutionName, balance: 0, pluggyItemId: item.id },
        update: { institution: institutionName },
      });
      let totalValue = 0;
      for (const inv of invPage.results) {
        totalValue += inv.balance ?? 0;
        await prisma.investment.create({
          data: {
            accountId: invAccount.id,
            name: inv.name,
            ticker: inv.code ?? null,
            type: mapInvestmentType(inv.type),
            quantity: inv.quantity ?? 1,
            currentPrice: inv.value ?? inv.balance ?? 0,
            costBasis: inv.amountOriginal ?? inv.value ?? 0,
            currency: inv.currencyCode ?? "BRL",
          },
        });
        stats.investments++;
      }
      await prisma.account.update({ where: { id: invAccount.id }, data: { balance: totalValue } });
    }
  } catch (e) {
    // Connector may not support investments — non-fatal
    console.warn("[pluggy] investments fetch skipped:", e instanceof Error ? e.message : e);
  }

  return { item, stats };
}
