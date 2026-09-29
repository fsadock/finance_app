import { describe, expect, it } from "vitest";
import { detectChain, isDust, lamportsToSol, portfolioValue, satsToBtc, shortAddress, type Holding } from "@/lib/domain/crypto";

const holding = (over: Partial<Holding> & { symbol: Holding["symbol"] }): Holding => ({
  quantity: 1,
  priceBrl: 100,
  priceUsd: 20,
  ...over,
});

describe("detectChain", () => {
  it("reconhece endereços reais de cada rede", () => {
    // endereços públicos conhecidos (bloco gênesis do Bitcoin e a conta de sistema da Solana)
    expect(detectChain("bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97")).toBe("BITCOIN");
    expect(detectChain("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe("BITCOIN");
    expect(detectChain("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe("SOLANA");
  });

  it("recusa o que não é endereço, em vez de guardar lixo", () => {
    expect(detectChain("meu endereço")).toBeNull();
    expect(detectChain("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb")).toBeNull(); // Ethereum: outra rede
    expect(detectChain("")).toBeNull();
  });
});

describe("conversões da cadeia", () => {
  it("converte as unidades inteiras que a blockchain usa", () => {
    expect(satsToBtc(150_000_000)).toBe(1.5);
    expect(lamportsToSol(2_500_000_000)).toBe(2.5);
  });
});

describe("portfolioValue", () => {
  it("soma nas duas moedas", () => {
    const total = portfolioValue([holding({ symbol: "BTC", quantity: 0.5, priceBrl: 400_000, priceUsd: 80_000 })]);
    expect(total.brl).toBe(200_000);
    expect(total.usd).toBe(40_000);
  });

  it("não inventa valor para o que não tem preço, e avisa quais são", () => {
    const total = portfolioValue([
      holding({ symbol: "SOL", quantity: 3, priceBrl: 600, priceUsd: 120 }),
      holding({ symbol: "USDT", quantity: 10, priceBrl: null, priceUsd: null }),
    ]);
    expect(total.brl).toBe(1800);
    expect(total.unpriced).toEqual(["USDT"]);
  });
});

describe("isDust", () => {
  it("esconde poeira que não chega a um centavo", () => {
    expect(isDust(holding({ symbol: "SOL", quantity: 0.00001, priceBrl: 600 }))).toBe(true);
    expect(isDust(holding({ symbol: "SOL", quantity: 0.1, priceBrl: 600 }))).toBe(false);
    expect(isDust(holding({ symbol: "BTC", quantity: 0 }))).toBe(true);
  });
});

describe("shortAddress", () => {
  it("mostra as pontas de um endereço longo", () => {
    expect(shortAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe("9WzD…AWWM");
    expect(shortAddress("curto")).toBe("curto");
  });
});
