import { getPluggy, pluggyErrorMessage } from "@/lib/pluggy/client";
import { prisma } from "@/lib/infra/db";
import { getConfig, setConfig } from "@/lib/infra/config";
import { snapshotBalances } from "@/lib/jobs/snapshots";
import { deterministicCategory, onlyDigits, parseInstallmentFromDescription, resolveCounterparty } from "@/lib/domain/brazil";
import { withRetry } from "@/lib/infra/retry";
import { logger } from "@/lib/infra/logger";
import type { AccountType as PrismaAccountType, InvestmentType as PrismaInvestmentType } from "@/generated/prisma/client";
import { errorMessage } from "@/lib/utils";
import { DAY_MS, dateOnly } from "@/lib/domain/format";
import { dateOnlyDuplicates } from "@/lib/domain/duplicates";

function mapAccountType(pluggyType: string, subtype: string | undefined | null): PrismaAccountType {
  if (subtype === "CREDIT_CARD" || pluggyType === "CREDIT") return "CREDIT_CARD";
  if (subtype === "SAVINGS_ACCOUNT") return "SAVINGS";
  if (subtype === "CHECKING_ACCOUNT") return "CHECKING";
  if (pluggyType === "INVESTMENT") return "INVESTMENT";
  if (pluggyType === "LOAN") return "LOAN";
  return "CHECKING";
}

/** Pluggy's `type` is the direction (DEBIT = money out); the raw amount sign varies by account type. */
function signedAmount(type: string | null | undefined, amount: number) {
  if (type === "DEBIT") return -Math.abs(amount);
  if (type === "CREDIT") return Math.abs(amount);
  return amount;
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

async function registerItem(itemId: string) {
  const pluggy = await getPluggy();
  const item = await withRetry(() => pluggy.fetchItem(itemId));
  const isNew = !(await prisma.pluggyItem.findUnique({ where: { pluggyId: item.id }, select: { id: true } }));
  let consentExpiresAt: Date | null = null;
  try {
    const consents = await pluggy.fetchConsents(itemId);
    const active = consents.results.filter((c) => !c.revokedAt && c.expiresAt).map((c) => new Date(c.expiresAt!));
    consentExpiresAt = active.length > 0 ? new Date(Math.max(...active.map((d) => d.getTime()))) : null;
  } catch {
    // non Open Finance connectors have no consents
  }
  await prisma.pluggyItem.upsert({
    where: { pluggyId: item.id },
    create: {
      pluggyId: item.id,
      connector: String(item.connector?.name ?? item.connector?.id ?? "unknown"),
      status: item.status,
      lastUpdated: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
      consentExpiresAt,
    },
    update: {
      status: item.status,
      lastUpdated: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
      consentExpiresAt,
    },
  });
  return { item, isNew };
}

export async function syncItem(itemId: string) {
  const pluggy = await getPluggy();
  const { item, isNew } = await registerItem(itemId);
  const institutionName = String(item.connector?.name ?? "Open Finance");
  logger.info("sync:start", { itemId, institution: institutionName });

  const [accountsPage, ownerDocuments, fixedCategories] = await Promise.all([
    withRetry(() => pluggy.fetchAccounts(itemId)),
    getOwnerDocuments(itemId),
    prisma.category.findMany({
      where: { name: { in: ["Transferências", "Pagamento de fatura", "Investimentos", "Rendimentos"] } },
      select: { id: true, name: true, excludeFromBudget: true },
    }),
  ]);
  const fixedCategoryByName = new Map(fixedCategories.map((c) => [c.name, c]));
  const stats = { accounts: 0, transactions: 0, updated: 0, investments: 0 };
  const syncedAccountIds: string[] = [];

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
      availableCreditLimit: a.creditData?.availableCreditLimit ?? null,
      balanceCloseDate: a.creditData?.balanceCloseDate ? dateOnly(a.creditData.balanceCloseDate) : null,
      balanceDueDate: a.creditData?.balanceDueDate ? dateOnly(a.creditData.balanceDueDate) : null,
      minimumPayment: a.creditData?.minimumPayment ?? null,
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
        availableCreditLimit: accountData.availableCreditLimit,
        balanceCloseDate: accountData.balanceCloseDate,
        balanceDueDate: accountData.balanceDueDate,
        minimumPayment: accountData.minimumPayment,
        pluggyItemId: item.id,
      },
    });
    stats.accounts++;

    // Pull credit card bills for CC accounts
    if (mapped === "CREDIT_CARD") {
      try {
        const bills = await pluggy.fetchCreditCardBills(a.id);
        for (const bill of bills.results) {
          await prisma.creditCardBill.upsert({
            where: { pluggyBillId: bill.id },
            create: {
              accountId: acct.id,
              pluggyBillId: bill.id,
              dueDate: dateOnly(bill.dueDate),
              totalAmount: bill.totalAmount,
              minimumPayment: bill.minimumPaymentAmount ?? null,
            },
            update: {
              dueDate: dateOnly(bill.dueDate),
              totalAmount: bill.totalAmount,
              minimumPayment: bill.minimumPaymentAmount ?? null,
            },
          });
        }
      } catch (e) {
        logger.warn("sync:bills_skipped", { accountId: a.id, error: errorMessage(e) });
      }
    }

    // Pull all available history (Pluggy returns whatever the bank provides; cap at 5 years back)
    const from = new Date();
    from.setFullYear(from.getFullYear() - 5);
    let page = 1;
    while (true) {
      const txs = await withRetry(() =>
        pluggy.fetchTransactions(a.id, { from: from.toISOString().slice(0, 10), pageSize: 500, page })
      );
      const existing = await prisma.transaction.findMany({
        where: { pluggyTxId: { in: txs.results.map((t) => t.id) } },
        select: { id: true, pluggyTxId: true, amount: true, date: true },
      });
      const byPluggyId = new Map(existing.map((e) => [e.pluggyTxId, e]));

      let toCreate = [];
      for (const t of txs.results) {
        const amount = signedAmount(t.type, t.amount);
        const card = t.creditCardMetadata;
        const purchaseDate = card?.purchaseDate ? new Date(card.purchaseDate) : null;
        const date = new Date(t.date);
        const isInstallment = (card?.totalInstallments ?? 0) > 1;
        const prev = byPluggyId.get(t.id);
        if (prev) {
          // pending charges often settle with a different amount/date. Installment dates are owned by
          // planInstallmentRedates (post-sync) — comparing with Pluggy's raw date would undo that fix.
          const dateChanged = !isInstallment && prev.date.getTime() !== date.getTime();
          if (prev.amount !== amount || dateChanged) {
            await prisma.transaction.update({ where: { id: prev.id }, data: dateChanged ? { amount, date } : { amount } });
            stats.updated++;
          }
          continue;
        }
        const counterparty = resolveCounterparty(amount, t.paymentData, ownerDocuments);
        const installment =
          card?.totalInstallments && card.totalInstallments > 1
            ? { number: card.installmentNumber ?? null, total: card.totalInstallments }
            : mapped === "CREDIT_CARD"
              ? parseInstallmentFromDescription(t.description ?? "")
              : null;
        const paymentMethod = t.paymentData?.paymentMethod?.toUpperCase() ?? null;
        // No-AI classifications: own-account Pix, card bill payments, investment moves, balance yield
        const fixedName = deterministicCategory({
          description: t.description ?? "",
          amount,
          accountType: mapped,
          counterpartyType: counterparty.type,
          paymentMethod,
        });
        const fixed = fixedName ? fixedCategoryByName.get(fixedName) : undefined;

        toCreate.push({
          accountId: acct.id,
          date,
          amount,
          currency: t.currencyCode ?? "BRL",
          description: t.description || t.descriptionRaw || "Sem descrição",
          merchantRaw: t.descriptionRaw ?? null,
          status: fixed ? ("POSTED" as const) : ("REVIEW" as const),
          categoryId: fixed?.id ?? null,
          excludeFromBudget: fixed?.excludeFromBudget ?? false,
          pluggyTxId: t.id,
          paymentMethod,
          counterpartyName: counterparty.name,
          counterpartyType: counterparty.type,
          merchantName: t.merchant?.name || t.merchant?.businessName || null,
          merchantCnpj: onlyDigits(t.merchant?.cnpj) || null,
          merchantCnae: t.merchant?.cnae ?? null,
          mcc: card?.payeeMCC ?? null,
          installmentNumber: installment?.number ?? null,
          totalInstallments: installment?.total ?? null,
          purchaseAmount: card?.totalAmount ?? null,
          purchaseDate,
          pluggyBillId: card?.billId ?? null,
          pluggyCategory: t.category ?? null,
        });
      }
      // Drop date-only copies of transactions that also come (or already exist) with their real time.
      if (toCreate.length > 0) {
        const days = toCreate.map((t) => t.date.getTime());
        const known = await prisma.transaction.findMany({
          where: { accountId: acct.id, date: { gte: new Date(Math.min(...days) - DAY_MS), lte: new Date(Math.max(...days) + DAY_MS) } },
          select: { accountId: true, date: true, amount: true, description: true },
        });
        const duplicates = new Set<unknown>(dateOnlyDuplicates([...known, ...toCreate]));
        toCreate = toCreate.filter((t) => !duplicates.has(t));
      }
      if (toCreate.length > 0) {
        await prisma.transaction.createMany({ data: toCreate });
        stats.transactions += toCreate.length;
      }
      if (page >= txs.totalPages || txs.results.length === 0) break;
      page++;
    }
    syncedAccountIds.push(acct.id);
  }

  // Investments: snapshot pattern (delete-and-replace) per item.
  // Investment values change over time; storing append-only would inflate net worth on every sync.
  try {
    const invPage = await withRetry(() => pluggy.fetchInvestments(itemId));
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
      syncedAccountIds.push(invAccount.id);
    } else {
      // Item has no investments — clean up any stale snapshot
      await prisma.investment.deleteMany({ where: { accountId: invAccountId } });
    }
  } catch (e) {
    logger.warn("sync:investments_skipped", { itemId, error: errorMessage(e) });
  }

  await snapshotBalances(syncedAccountIds);
  await prisma.pluggyItem.update({
    where: { pluggyId: item.id },
    data: { lastSyncedAt: new Date(), lastError: null },
  });
  logger.info("sync:done", { itemId, isNew, ...stats });
  return { item, stats, isNew };
}

/**
 * The account owner's CPF/CNPJ (digits), used to recognize Pix/TED between own accounts.
 * Cached in AppConfig and merged across items (e.g. a personal CPF plus a MEI CNPJ).
 */
async function getOwnerDocuments(itemId: string): Promise<string[]> {
  const saved = await getConfig("ownerDocuments");
  const known = new Set<string>(saved ? (JSON.parse(saved) as string[]) : []);
  try {
    const identity = await (await getPluggy()).fetchIdentityByItemId(itemId);
    for (const doc of [identity.document, identity.taxNumber]) {
      const digits = onlyDigits(doc);
      if (digits.length === 11 || digits.length === 14) known.add(digits);
    }
    await setConfig("ownerDocuments", JSON.stringify([...known]));
  } catch (e) {
    logger.warn("sync:identity_unavailable", { itemId, error: errorMessage(e) });
  }
  return [...known];
}

/** Records a failed sync on the item so the UI can surface it. */
export async function markSyncFailed(itemId: string, error: unknown) {
  const message = pluggyErrorMessage(error);
  await prisma.pluggyItem.updateMany({ where: { pluggyId: itemId }, data: { lastError: message.slice(0, 500) } });
  logger.error("sync:failed", { itemId, error: message });
}

/** Syncs every connection; a failing one is recorded and doesn't stop the others. */
export async function syncAllItems() {
  const items = await prisma.pluggyItem.findMany();
  const results = [];
  for (const it of items) {
    try {
      const r = await syncItem(it.pluggyId);
      results.push({ itemId: it.pluggyId, ok: true, stats: r.stats });
    } catch (e) {
      await markSyncFailed(it.pluggyId, e);
      results.push({ itemId: it.pluggyId, ok: false, error: pluggyErrorMessage(e) });
    }
  }
  return results;
}
