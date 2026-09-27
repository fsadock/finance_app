import { describe, expect, it } from "vitest";
import { pluggyErrorMessage } from "@/lib/pluggy/client";

describe("pluggyErrorMessage", () => {
  // What the SDK actually rejects with: the parsed response body, not an Error
  it("shows what the API answered", () => {
    expect(pluggyErrorMessage({ message: "This endpoint is deprecated.", code: 410, codeDescription: "ENDPOINT_DEPRECATED" })).toBe(
      "Pluggy: This endpoint is deprecated."
    );
    expect(pluggyErrorMessage({ response: { body: '{"message":"clientId must be a UUID"}' } })).toBe("Pluggy: clientId must be a UUID");
  });

  it("falls back for anything else", () => {
    expect(pluggyErrorMessage(new Error("socket hang up"))).toBe("socket hang up");
    expect(pluggyErrorMessage(undefined)).toBe("Erro desconhecido");
  });
});
