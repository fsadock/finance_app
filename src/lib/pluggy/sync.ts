import { getPluggy } from "./client";
import { prisma } from "../db";
import { detectTransfers } from "../transfers";
import { categorizeReviewTransactions } from "../ai/categorize";
import { detectRecurrings } from "../ai/recurrings";
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
    const displayName = a.name || a.marketingName || "Conta";

    // Backfill: if a legacy account exists for this item+name without pluggyAccountId,
    // adopt it before upsert to avoid creating a duplicate row.
    const legacy = await prisma.account.findFirst({
      where: { pluggyItemId: item.id, name: displayName, pluggyAccountId: null },
      select: { id: true },
    });
    if (legacy) {
      await prisma.account.update({
        where: { id: legacy.id },
        data: { pluggyAccountId: a.id },
      });
    }

    const accountData = {
      name: displayName,
      type: mapped,
      institution: institutionName,
      currency: a.currencyCode ?? "BRL",
      balance,
      creditLimit: a.creditData?.creditLimit ?? null,
      pluggyItemId: item.id,
      pluggyAccountId: a.id,
    };
    const acct = await prisma.account.upsert({
      where: { pluggyAccountId: a.id },
      create: accountData,
      update: {
        balance: accountData.balance,
        type: accountData.type,
        institution: accountData.institution,
        currency: accountData.currency,
        creditLimit: accountData.creditLimit,
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
        const exists = await prisma.transaction.findFirst({ where: { pluggyTxId: t.id }, select: { id: true } });
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

  // Investments: snapshot pattern (delete-and-replace) per item.
  // Investment values change over time; storing append-only would inflate net worth on every sync.
  try {
    const invPage = await pluggy.fetchInvestments(itemId);
    const invAccountId = `inv-${itemId}`;
    if (invPage.results.length > 0) {
      const invAccount = await prisma.account.upsert({
        where: { id: invAccountId },
        create: { id: invAccountId, name: `Investimentos ${institutionName}`, type: "INVESTMENT", institution: institutionName, balance: 0, pluggyItemId: item.id },
        update: { institution: institutionName, pluggyItemId: item.id },
      });
      // Wipe prior snapshot for this account, then re-insert
      await prisma.investment.deleteMany({ where: { accountId: invAccount.id } });
      let totalValue = 0;
      const rows = invPage.results.map((inv) => {
        // Pluggy returns *total* balance and *total* amountOriginal already
        // aggregated across the whole position. We don't multiply by quantity
        // (which can be in raw units like 178500 for fixed income).
        // Store as: quantity=1, currentPrice=total balance, costBasis=total cost.
        const balance = inv.balance ?? inv.value ?? 0;
        const original = inv.amountOriginal ?? balance;
        totalValue += balance;
        return {
          accountId: invAccount.id,
          name: inv.name,
          ticker: inv.code ?? null,
          type: mapInvestmentType(inv.type),
          quantity: 1,
          currentPrice: balance,
          costBasis: original,
          currency: inv.currencyCode ?? "BRL",
        };
      });
      await prisma.investment.createMany({ data: rows });
      stats.investments = rows.length;
      await prisma.account.update({ where: { id: invAccount.id }, data: { balance: totalValue } });
    } else {
      // Item has no investments — clean up any stale snapshot
      await prisma.investment.deleteMany({ where: { accountId: invAccountId } });
    }
  } catch (e) {
    // Connector may not support investments — non-fatal
    console.warn("[pluggy] investments fetch skipped:", e instanceof Error ? e.message : e);
  }

  return { item, stats };
}

export async function runPostSyncJobs() {
  const out = { transfersPaired: 0, categorized: 0, fromRules: 0, fromAI: 0, recurringsDetected: 0 };

  try {
    const t = await detectTransfers(60);
    out.transfersPaired = t.paired;
  } catch (e) {
    console.warn("[post-sync] transfers failed:", e instanceof Error ? e.message : e);
  }

  // Drain REVIEW queue with up to 12 categorize batches
  for (let i = 0; i < 12; i++) {
    try {
      const c = await categorizeReviewTransactions();
      if (!c.applied) break;
      out.categorized += c.applied;
      out.fromRules += c.fromRules ?? 0;
      out.fromAI += c.fromAI ?? 0;
    } catch (e) {
      console.warn("[post-sync] categorize failed:", e instanceof Error ? e.message : e);
      break;
    }
  }

  try {
    const r = await detectRecurrings();
    out.recurringsDetected = r.detected;
  } catch (e) {
    console.warn("[post-sync] recurrings failed:", e instanceof Error ? e.message : e);
  }

  return out;
}
