import { OAUTH_LINK_ERROR } from "@vaultkeeper/shared/constants";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";

type AccountHooks = NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["account"]>;
type AccountCreateBefore = NonNullable<NonNullable<AccountHooks["create"]>["before"]>;

export const CREDENTIAL_PROVIDER_ID = "credential";

/**
 * Second layer of R-AUTH-7 (spike 2.1): refuse creating an OAuth account row for a user whose
 * email was never verified and who already has a password (credential) account. Better Auth's
 * default implicit-link gate (requireLocalEmailVerified) is the first layer; this one also covers
 * explicit /link-social and survives that option's upcoming removal/changes.
 * Consequence (accepted in the spike): password users cannot attach Google/Discord in the MVP,
 * since no email verification exists. Throwing APIError makes the OAuth callback redirect with
 * `?error=LINK_REQUIRES_PASSWORD_SIGN_IN`.
 */
export const blockLinkIntoUnverifiedCredentialUser: AccountCreateBefore = async (account, ctx) => {
  if (account.providerId === CREDENTIAL_PROVIDER_ID || !ctx) return;
  const adapter = ctx.context.internalAdapter;
  const owner = await adapter.findUserById(account.userId);
  if (!owner || owner.emailVerified) return;
  const existing = await adapter.findAccounts(account.userId);
  if (existing.some((row) => row.providerId === CREDENTIAL_PROVIDER_ID)) {
    throw new APIError("FORBIDDEN", {
      code: OAUTH_LINK_ERROR.LINK_REQUIRES_PASSWORD_SIGN_IN,
      message: "This email already has a password account. Sign in with your password.",
    });
  }
};
