import { OAUTH_LINK_ERROR } from "@vaultkeeper/shared/constants";

const LINK_REFUSED: ReadonlySet<string> = new Set(Object.values(OAUTH_LINK_ERROR));

/**
 * Message for Better Auth's `?error=` on the OAuth error callback (/login). Refused links into an
 * unverified password account (R-AUTH-7) get specific guidance; the raw code is never shown.
 */
export function oauthErrorMessage(error: string | undefined): string | undefined {
  if (!error) return undefined;
  if (LINK_REFUSED.has(error)) {
    return "This email already has a password account. Sign in with your password instead.";
  }
  return "Signing in with that provider didn't work. Try again, or use your email instead.";
}

/** What a failed Better Auth call tells us (status + optional error code). */
export interface AuthFailureInfo {
  status: number;
  code?: string | undefined;
}

const EMAIL_TAKEN_CODES: ReadonlySet<string> = new Set([
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);

/** Form-level error text. Sign-in failures stay generic (R-AUTH-1 S3: no account enumeration). */
export function authFailureMessage({ status, code }: AuthFailureInfo): string {
  if (status === 401) return "Invalid email or password.";
  if (code !== undefined && EMAIL_TAKEN_CODES.has(code)) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (status === 429) return "Too many attempts. Wait a few seconds and try again.";
  return "Something went wrong. Please try again.";
}

/** Thrown by the auth mutations; carries what authFailureMessage needs. */
export class AuthFailure extends Error {
  override readonly name = "AuthFailure";
  readonly status: number;
  readonly code: string | undefined;

  constructor({ status, code }: AuthFailureInfo) {
    super(authFailureMessage({ status, code }));
    this.status = status;
    this.code = code;
  }
}
