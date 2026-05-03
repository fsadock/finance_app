import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("../ai/client", () => ({ getAnthropic: vi.fn(), MODEL_FAST: "claude-haiku" }));

import { matchRulesToTransactions } from "../ai/categorize";

const tx = (id: string, description: string, merchantRaw?: string) => ({
  id,
  description,
  merchantRaw: merchantRaw ?? null,
});

const rule = (pattern: string, categoryId: string, ruleId = `rule-${pattern}`) => ({
  id: ruleId,
  pattern,
  categoryId,
});

describe("matchRulesToTransactions", () => {
  it("matches a transaction when its normalized pattern exists in rules", () => {
    const txs = [tx("t1", "NETFLIX BRASIL")];
    const rules = [rule("netflix brasil", "cat-streaming")];
    const { matched, remaining } = matchRulesToTransactions(txs, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.tx.id).toBe("t1");
    expect(matched[0]!.rule.categoryId).toBe("cat-streaming");
    expect(remaining).toHaveLength(0);
  });

  it("puts unmatched transactions in remaining", () => {
    const txs = [tx("t1", "UNKNOWN MERCHANT XYZ")];
    const rules = [rule("netflix brasil", "cat-streaming")];
    const { matched, remaining } = matchRulesToTransactions(txs, rules);
    expect(matched).toHaveLength(0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("t1");
  });

  it("normalizes descriptions before matching (removes digits, accents)", () => {
    const txs = [tx("t1", "NETFLIX 01/2025")]; // digits stripped → "netflix"
    const rules = [rule("netflix", "cat-streaming")];
    const { matched } = matchRulesToTransactions(txs, rules);
    expect(matched).toHaveLength(1);
  });

  it("prefers merchantRaw over description when provided", () => {
    const txs = [tx("t1", "RAW DESCRIPTION IGNORED", "SPOTIFY PREMIUM")];
    const rules = [rule("spotify premium", "cat-streaming")];
    const { matched } = matchRulesToTransactions(txs, rules);
    expect(matched).toHaveLength(1);
  });

  it("splits correctly across multiple transactions", () => {
    const txs = [
      tx("t1", "NETFLIX BRASIL"),
      tx("t2", "UNKNOWN MERCHANT"),
      tx("t3", "SPOTIFY MUSIC"),
    ];
    const rules = [
      rule("netflix brasil", "cat-streaming"),
      rule("spotify music", "cat-streaming"),
    ];
    const { matched, remaining } = matchRulesToTransactions(txs, rules);
    expect(matched).toHaveLength(2);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("t2");
  });

  it("returns all transactions in remaining when rules are empty", () => {
    const txs = [tx("t1", "NETFLIX"), tx("t2", "SPOTIFY")];
    const { matched, remaining } = matchRulesToTransactions(txs, []);
    expect(matched).toHaveLength(0);
    expect(remaining).toHaveLength(2);
  });

  it("returns empty matched/remaining for empty transaction list", () => {
    const { matched, remaining } = matchRulesToTransactions([], [rule("netflix brasil", "cat-x")]);
    expect(matched).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it("does not match when pattern is empty (whitespace description)", () => {
    const txs = [tx("t1", "   ")]; // normalizes to ""
    const rules = [rule("", "cat-x")];
    const { matched, remaining } = matchRulesToTransactions(txs, rules);
    expect(matched).toHaveLength(0);
    expect(remaining).toHaveLength(1);
  });

  it("preserves the matched rule reference on each result", () => {
    const txs = [tx("t1", "IFOOD PEDIDO")];
    const r = rule("ifood pedido", "cat-delivery", "rule-ifood");
    const { matched } = matchRulesToTransactions(txs, [r]);
    expect(matched[0]!.rule.id).toBe("rule-ifood");
  });
});
