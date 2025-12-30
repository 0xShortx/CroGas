import { describe, it, expect } from "vitest";

// Test forwarder EIP-712 domain and types

describe("ForwarderService", () => {
  const FORWARDER_ADDRESS = "0x523D5F604788a9cFC74CcF81F0DE5B3b5623635F";
  const CHAIN_ID = 338;

  describe("EIP-712 Domain", () => {
    function getDomain() {
      return {
        name: "MinimalForwarder",
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: FORWARDER_ADDRESS,
      };
    }

    it("should return correct domain name", () => {
      const domain = getDomain();
      expect(domain.name).toBe("MinimalForwarder");
    });

    it("should return version 1", () => {
      const domain = getDomain();
      expect(domain.version).toBe("1");
    });

    it("should include correct chainId", () => {
      const domain = getDomain();
      expect(domain.chainId).toBe(338);
    });

    it("should include verifying contract address", () => {
      const domain = getDomain();
      expect(domain.verifyingContract).toBe(FORWARDER_ADDRESS);
    });
  });

  describe("EIP-712 Types", () => {
    function getTypes() {
      return {
        ForwardRequest: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gas", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      };
    }

    it("should have ForwardRequest type", () => {
      const types = getTypes();
      expect(types.ForwardRequest).toBeDefined();
    });

    it("should have all required fields", () => {
      const types = getTypes();
      const fieldNames = types.ForwardRequest.map((f) => f.name);

      expect(fieldNames).toContain("from");
      expect(fieldNames).toContain("to");
      expect(fieldNames).toContain("value");
      expect(fieldNames).toContain("gas");
      expect(fieldNames).toContain("nonce");
      expect(fieldNames).toContain("deadline");
      expect(fieldNames).toContain("data");
    });

    it("should have correct field types", () => {
      const types = getTypes();
      const typeMap = Object.fromEntries(
        types.ForwardRequest.map((f) => [f.name, f.type])
      );

      expect(typeMap.from).toBe("address");
      expect(typeMap.to).toBe("address");
      expect(typeMap.value).toBe("uint256");
      expect(typeMap.gas).toBe("uint256");
      expect(typeMap.nonce).toBe("uint256");
      expect(typeMap.deadline).toBe("uint256");
      expect(typeMap.data).toBe("bytes");
    });

    it("should have 7 fields total", () => {
      const types = getTypes();
      expect(types.ForwardRequest).toHaveLength(7);
    });
  });

  describe("ForwardRequest validation", () => {
    interface ForwardRequest {
      from: string;
      to: string;
      value: string;
      gas: string;
      nonce: string;
      deadline: string;
      data: string;
    }

    function validateRequest(request: ForwardRequest): {
      valid: boolean;
      errors: string[];
    } {
      const errors: string[] = [];

      // Validate addresses
      if (!/^0x[a-fA-F0-9]{40}$/.test(request.from)) {
        errors.push("Invalid 'from' address");
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(request.to)) {
        errors.push("Invalid 'to' address");
      }

      // Validate numeric strings
      try {
        BigInt(request.value);
      } catch {
        errors.push("Invalid 'value'");
      }

      try {
        BigInt(request.gas);
      } catch {
        errors.push("Invalid 'gas'");
      }

      try {
        BigInt(request.nonce);
      } catch {
        errors.push("Invalid 'nonce'");
      }

      try {
        BigInt(request.deadline);
      } catch {
        errors.push("Invalid 'deadline'");
      }

      // Validate data is hex
      if (!/^0x[a-fA-F0-9]*$/.test(request.data)) {
        errors.push("Invalid 'data' - must be hex");
      }

      // Validate deadline is in future
      const now = Math.floor(Date.now() / 1000);
      if (BigInt(request.deadline) <= BigInt(now)) {
        errors.push("Deadline must be in the future");
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    }

    const validRequest: ForwardRequest = {
      from: "0x1234567890123456789012345678901234567890",
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      value: "0",
      gas: "100000",
      nonce: "0",
      deadline: (Math.floor(Date.now() / 1000) + 3600).toString(),
      data: "0x",
    };

    it("should accept valid request", () => {
      const result = validateRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid from address", () => {
      const request = { ...validRequest, from: "invalid" };
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid 'from' address");
    });

    it("should reject invalid to address", () => {
      const request = { ...validRequest, to: "0x123" };
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid 'to' address");
    });

    it("should reject non-numeric value", () => {
      const request = { ...validRequest, value: "not-a-number" };
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid 'value'");
    });

    it("should reject past deadline", () => {
      const pastDeadline = (Math.floor(Date.now() / 1000) - 3600).toString();
      const request = { ...validRequest, deadline: pastDeadline };
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Deadline must be in the future");
    });

    it("should reject invalid hex data", () => {
      const request = { ...validRequest, data: "not-hex" };
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid 'data' - must be hex");
    });

    it("should accept empty data as 0x", () => {
      const request = { ...validRequest, data: "0x" };
      const result = validateRequest(request);
      expect(result.valid).toBe(true);
    });

    it("should accept valid calldata", () => {
      const request = {
        ...validRequest,
        data: "0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890",
      };
      const result = validateRequest(request);
      expect(result.valid).toBe(true);
    });
  });

  describe("Request tuple conversion", () => {
    it("should convert request to tuple format", () => {
      const request = {
        from: "0x1234567890123456789012345678901234567890",
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        value: "1000000000000000000",
        gas: "100000",
        nonce: "5",
        deadline: "1735500000",
        data: "0xabcdef",
      };

      const tuple = [
        request.from,
        request.to,
        BigInt(request.value),
        BigInt(request.gas),
        BigInt(request.nonce),
        BigInt(request.deadline),
        request.data,
      ];

      expect(tuple[0]).toBe(request.from);
      expect(tuple[1]).toBe(request.to);
      expect(tuple[2]).toBe(1000000000000000000n);
      expect(tuple[3]).toBe(100000n);
      expect(tuple[4]).toBe(5n);
      expect(tuple[5]).toBe(1735500000n);
      expect(tuple[6]).toBe(request.data);
    });
  });
});
