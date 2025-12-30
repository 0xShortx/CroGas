import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";
import { GasStationError } from "../utils/errors.js";

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error("Request error", {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  // Handle known errors
  if (err instanceof GasStationError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
