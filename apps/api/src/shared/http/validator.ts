import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { ValidationError } from "./errors";

export interface ValidationIssue {
  path: PropertyKey[];
  code: string;
  message: string;
}

export interface ValidationFailureDetails {
  target: keyof ValidationTargets;
  issues: ValidationIssue[];
}

/**
 * zValidator with the API's failure contract (design 02): invalid input throws ValidationError,
 * which onError renders as 422 VALIDATION_FAILED with `details: { target, issues }`.
 * Types flow through unchanged, so `c.req.valid(target)` and the RPC client stay inferred.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (result.success) return;
    const details: ValidationFailureDetails = {
      target,
      issues: result.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    };
    throw new ValidationError("Invalid input", details);
  });
}
