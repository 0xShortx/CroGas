import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger.js";

// General rate limiter
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: "RATE_LIMITED",
    message: "Too many requests, please try again later",
    retryAfter: 60,
  },
  handler: (req, res, next, options) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

// Stricter limiter for relay endpoint
export const relayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 relays per minute per IP
  message: {
    error: "RATE_LIMITED",
    message: "Too many relay requests, please try again later",
    retryAfter: 60,
  },
  keyGenerator: (req) => {
    // Use wallet address if available in the transaction
    // Otherwise fall back to IP
    return req.ip ?? "unknown";
  },
});

// Estimation endpoint limiter (more lenient)
export const estimateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 estimates per minute
  message: {
    error: "RATE_LIMITED",
    message: "Too many estimation requests",
    retryAfter: 60,
  },
});
