import { describe, it, expect } from "vitest";
import { normalizeMerchant, normalizeForGrouping } from "../ai/merchant";

describe("normalizeMerchant", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeMerchant("PADARIA São João")).toBe("padaria sao joao");
  });

  it("removes all digits", () => {
    expect(normalizeMerchant("NETFLIX 12345 SERV")).toBe("netflix serv");
  });

  it("removes parcel notation", () => {
    expect(normalizeMerchant("Loja PARC 2/6 roupa")).toBe("loja roupa");
  });

  it("removes special characters", () => {
    expect(normalizeMerchant("Uber* Trip #99 - SP")).toBe("uber trip sp");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeMerchant("mercado   livre")).toBe("mercado livre");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeMerchant("  spotify  ")).toBe("spotify");
  });

  it("produces consistent output for the same merchant with varying metadata", () => {
    const a = normalizeMerchant("IFOOD*RESTAURANTE 01/06");
    const b = normalizeMerchant("IFOOD*RESTAURANTE 15/06");
    expect(a).toBe(b);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeMerchant("   ")).toBe("");
  });
});

describe("normalizeForGrouping", () => {
  it("strips common banking prefixes", () => {
    // /^pix (enviado|recebido) \w+ / strips "pix enviado <word> " leaving the remainder
    expect(normalizeForGrouping("pix enviado joao silva")).toBe("silva");
    expect(normalizeForGrouping("pix recebido maria silva")).toBe("silva");
    expect(normalizeForGrouping("pagamento energia")).toBe("energia");
  });

  it("strips TED prefix", () => {
    // /^ted (enviada|recebida) \w+ / strips "ted enviada <word> "
    expect(normalizeForGrouping("ted enviada banco inter")).toBe("inter");
  });

  it("removes digits", () => {
    expect(normalizeForGrouping("netflix 2025")).toBe("netflix");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeForGrouping("")).toBe("");
  });

  it("groups similar recurring descriptions together", () => {
    const a = normalizeForGrouping("NETFLIX 01 2025");
    const b = normalizeForGrouping("NETFLIX 02 2025");
    expect(a).toBe(b);
  });

  it("handles symbols by replacing with space", () => {
    expect(normalizeForGrouping("SPOTIFY*PREMIUM")).toBe("spotify premium");
  });
});
