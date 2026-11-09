import { ApiError } from "@vaultkeeper/api-client";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import { z } from "zod";

const validationDetails = z.object({
  issues: z.array(
    z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
  ),
});

/** Field messages of a 422 VALIDATION_FAILED, keyed by the first path segment. */
export function fieldIssues(error: unknown): Map<string, string> {
  const issues = new Map<string, string>();
  if (!(error instanceof ApiError) || error.code !== ERROR_CODE.VALIDATION_FAILED) return issues;
  const parsed = validationDetails.safeParse(error.details);
  for (const issue of parsed.success ? parsed.data.issues : []) {
    const [field] = issue.path;
    if (field !== undefined && !issues.has(String(field))) issues.set(String(field), issue.message);
  }
  return issues;
}

export function settingsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}
