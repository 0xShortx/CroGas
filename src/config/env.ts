import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  // Network
  CRONOS_RPC_URL: z.string().url().default("https://evm-t3.cronos.org/"),
  CHAIN_ID: z.coerce.number().default(338),

  // Relayer Wallet
  RELAYER_PRIVATE_KEY: z.string().startsWith("0x"),

  // Tokens
  USDC_ADDRESS: z.string().startsWith("0x"),
  WCRO_ADDRESS: z.string().startsWith("0x").default("0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD4"),

  // Forwarder
  FORWARDER_ADDRESS: z.string().startsWith("0x"),

  // x402
  X402_FACILITATOR_URL: z.string().url().optional(),
  RECEIVING_WALLET: z.string().startsWith("0x"),

  // Pricing
  MARKUP_PERCENTAGE: z.coerce.number().min(0).max(100).default(20),
  MIN_PRICE_USDC: z.coerce.number().positive().default(0.01),

  // API Keys
  CRONOS_EXPLORER_API_KEY: z.string().optional(),
  CRYPTO_COM_API_KEY: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Redis
  REDIS_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
