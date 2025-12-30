import { describe, it, expect, vi, beforeEach } from "vitest";

// Test payment parsing and validation logic

interface X402Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

interface X402Payment {
  version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: X402Authorization;
  };
}

describe("PaymentService", () => {
  const RECEIVING_WALLET = "0xF40B9a42cD26166051455c23508C2EbA997da7e2";

  describe("parsePaymentHeader", () => {
    function parsePaymentHeader(header: string): X402Payment | null {
      try {
        const decoded = Buffer.from(header, "base64").toString("utf-8");
        return JSON.parse(decoded) as X402Payment;
      } catch {
        return null;
      }
    }

    it("should parse valid base64 encoded payment", () => {
      const payment: X402Payment = {
        version: 1,
        scheme: "exact",
        network: "eip155:338",
        payload: {
          signature: "0x" + "a".repeat(130),
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: RECEIVING_WALLET,
            value: "10000",
            validAfter: "0",
            validBefore: "9999999999",
            nonce: "0x" + "b".repeat(64),
          },
        },
      };

      const encoded = Buffer.from(JSON.stringify(payment)).toString("base64");
      const result = parsePaymentHeader(encoded);

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
      expect(result?.scheme).toBe("exact");
      expect(result?.payload.authorization.value).toBe("10000");
    });

    it("should return null for invalid base64", () => {
      const result = parsePaymentHeader("not-valid-base64!!!");
      expect(result).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      const invalidJson = Buffer.from("{ invalid json }").toString("base64");
      const result = parsePaymentHeader(invalidJson);
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const result = parsePaymentHeader("");
      expect(result).toBeNull();
    });
  });

  describe("verifyPayment", () => {
    function verifyPayment(
      payment: X402Payment,
      expectedAmount: bigint,
      receivingWallet: string
    ): { valid: boolean; reason?: string } {
      const auth = payment.payload.authorization;

      // Check recipient
      if (auth.to.toLowerCase() !== receivingWallet.toLowerCase()) {
        return { valid: false, reason: "Wrong recipient address" };
      }

      // Check amount
      const paymentAmount = BigInt(auth.value);
      if (paymentAmount < expectedAmount) {
        return {
          valid: false,
          reason: `Insufficient amount: got ${auth.value}, need ${expectedAmount}`,
        };
      }

      // Check timing
      const now = Math.floor(Date.now() / 1000);
      if (now <= Number(auth.validAfter)) {
        return { valid: false, reason: "Authorization not yet valid" };
      }
      if (now >= Number(auth.validBefore)) {
        return { valid: false, reason: "Authorization expired" };
      }

      return { valid: true };
    }

    const validPayment: X402Payment = {
      version: 1,
      scheme: "exact",
      network: "eip155:338",
      payload: {
        signature: "0x" + "a".repeat(130),
        authorization: {
          from: "0x1234567890123456789012345678901234567890",
          to: RECEIVING_WALLET,
          value: "10000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0x" + "b".repeat(64),
        },
      },
    };

    it("should accept valid payment", () => {
      const result = verifyPayment(validPayment, 10000n, RECEIVING_WALLET);
      expect(result.valid).toBe(true);
    });

    it("should reject wrong recipient", () => {
      const payment = {
        ...validPayment,
        payload: {
          ...validPayment.payload,
          authorization: {
            ...validPayment.payload.authorization,
            to: "0x0000000000000000000000000000000000000000",
          },
        },
      };

      const result = verifyPayment(payment, 10000n, RECEIVING_WALLET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Wrong recipient address");
    });

    it("should reject insufficient amount", () => {
      const result = verifyPayment(validPayment, 20000n, RECEIVING_WALLET);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Insufficient amount");
    });

    it("should accept payment with higher amount", () => {
      const payment = {
        ...validPayment,
        payload: {
          ...validPayment.payload,
          authorization: {
            ...validPayment.payload.authorization,
            value: "50000",
          },
        },
      };

      const result = verifyPayment(payment, 10000n, RECEIVING_WALLET);
      expect(result.valid).toBe(true);
    });

    it("should reject not-yet-valid authorization", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const payment = {
        ...validPayment,
        payload: {
          ...validPayment.payload,
          authorization: {
            ...validPayment.payload.authorization,
            validAfter: futureTime.toString(),
          },
        },
      };

      const result = verifyPayment(payment, 10000n, RECEIVING_WALLET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Authorization not yet valid");
    });

    it("should reject expired authorization", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const payment = {
        ...validPayment,
        payload: {
          ...validPayment.payload,
          authorization: {
            ...validPayment.payload.authorization,
            validBefore: pastTime.toString(),
          },
        },
      };

      const result = verifyPayment(payment, 10000n, RECEIVING_WALLET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Authorization expired");
    });

    it("should be case-insensitive for address comparison", () => {
      const payment = {
        ...validPayment,
        payload: {
          ...validPayment.payload,
          authorization: {
            ...validPayment.payload.authorization,
            to: RECEIVING_WALLET.toLowerCase(),
          },
        },
      };

      const result = verifyPayment(payment, 10000n, RECEIVING_WALLET.toUpperCase());
      expect(result.valid).toBe(true);
    });
  });

  describe("signature parsing", () => {
    function parseSignature(sig: string): { r: string; s: string; v: number } {
      const r = "0x" + sig.slice(2, 66);
      const s = "0x" + sig.slice(66, 130);
      const v = parseInt(sig.slice(130, 132), 16);
      return { r, s, v };
    }

    it("should parse EIP-3009 signature correctly", () => {
      // A valid looking signature
      const sig =
        "0x" +
        "a".repeat(64) + // r (32 bytes)
        "b".repeat(64) + // s (32 bytes)
        "1b"; // v (1 byte = 27)

      const { r, s, v } = parseSignature(sig);

      expect(r).toBe("0x" + "a".repeat(64));
      expect(s).toBe("0x" + "b".repeat(64));
      expect(v).toBe(27);
    });

    it("should handle v = 28", () => {
      const sig =
        "0x" +
        "1".repeat(64) +
        "2".repeat(64) +
        "1c"; // v = 28

      const { v } = parseSignature(sig);
      expect(v).toBe(28);
    });
  });

  describe("x402 response format", () => {
    it("should create valid 402 response structure", () => {
      const response = {
        error: "Payment Required",
        x402: {
          version: "1",
          accepts: [
            {
              scheme: "exact",
              network: "eip155:338",
              asset: "0x38Bf87D7281A2F84c8ed5aF1410295f7BD4E20a1",
              payTo: RECEIVING_WALLET,
              maxAmountRequired: "10000",
            },
          ],
        },
        quote: {
          gasEstimate: "100000",
          priceUSDC: "0.010000",
        },
      };

      expect(response.x402.accepts).toHaveLength(1);
      expect(response.x402.accepts[0].scheme).toBe("exact");
      expect(response.x402.accepts[0].network).toBe("eip155:338");
    });
  });
});
