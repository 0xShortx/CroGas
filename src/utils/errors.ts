export class GasStationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GasStationError";
  }
}

export class ValidationError extends GasStationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class TransactionError extends GasStationError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, 400, details);
    this.name = "TransactionError";
  }
}

export class PaymentError extends GasStationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PAYMENT_ERROR", 402, details);
    this.name = "PaymentError";
  }
}

export class InsufficientFundsError extends GasStationError {
  constructor(required: string, available: string) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      "INSUFFICIENT_FUNDS",
      503,
      { required, available }
    );
    this.name = "InsufficientFundsError";
  }
}

// Error codes for transaction failures
export const TX_ERROR_CODES = {
  INVALID_SIGNATURE: "TX_INVALID_SIGNATURE",
  WRONG_CHAIN: "TX_WRONG_CHAIN",
  SIMULATION_FAILED: "TX_SIMULATION_FAILED",
  WILL_REVERT: "TX_WILL_REVERT",
  NONCE_TOO_LOW: "TX_NONCE_TOO_LOW",
  GAS_TOO_LOW: "TX_GAS_TOO_LOW",
  BROADCAST_FAILED: "TX_BROADCAST_FAILED",
} as const;

export type TxErrorCode = typeof TX_ERROR_CODES[keyof typeof TX_ERROR_CODES];
