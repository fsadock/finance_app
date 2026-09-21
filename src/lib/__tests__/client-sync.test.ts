import { afterEach, describe, expect, it, vi } from "vitest";
import { describeSync, syncAllAccounts } from "@/lib/client/sync";

const summary = { newTransactions: 0, failedConnections: 0, pendingReview: 0, aiError: null };

describe("describeSync", () => {
  it("says when nothing is new", () => {
    expect(describeSync(summary)).toBe("Sincronizado · nada novo");
  });
  it("counts new transactions and what is left to review", () => {
    expect(describeSync({ ...summary, newTransactions: 3, pendingReview: 2 })).toBe("Sincronizado · 3 transações novas · 2 para revisar");
    expect(describeSync({ ...summary, newTransactions: 1 })).toBe("Sincronizado · 1 transação nova");
  });
  it("reports failed connections and AI errors", () => {
    expect(describeSync({ ...summary, failedConnections: 1, aiError: "IA indisponível: sem créditos", pendingReview: 4 })).toBe(
      "Sincronizado · nada novo · 1 conexão com erro · ⚠ IA indisponível: sem créditos"
    );
  });
});

describe("syncAllAccounts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sums new transactions across connections", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        items: [{ ok: true, stats: { transactions: 2 } }, { ok: true, stats: { transactions: 1 } }, { ok: false }],
        post: { pendingReview: 5, aiError: null },
      })
    );
    expect(await syncAllAccounts()).toEqual({ newTransactions: 3, failedConnections: 1, pendingReview: 5, aiError: null });
  });

  it("throws the API's error message", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "Credenciais da Pluggy não configuradas" }, { status: 400 }));
    await expect(syncAllAccounts()).rejects.toThrow("Credenciais da Pluggy não configuradas");
  });
});
