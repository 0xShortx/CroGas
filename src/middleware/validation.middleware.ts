import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

export function validationMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error("Request validation error", {
    path: req.path,
    method: req.method,
    error: err.message,
  });

  res.status(400).json({
    error: "VALIDATION_ERROR",
    message: err.message,
  });
}
