import { OAUTH_LINK_ERROR } from "@vaultkeeper/shared/constants";
import { describe, expect, it } from "vitest";
import { authFailureMessage, oauthErrorMessage } from "./messages";

describe("oauthErrorMessage", () => {
  it("no error -> no message", () => {
    expect(oauthErrorMessage(undefined)).toBeUndefined();
    expect(oauthErrorMessage("")).toBeUndefined();
  });

  it.each(Object.values(OAUTH_LINK_ERROR))("%s -> sign in with your password", (code) => {
    expect(oauthErrorMessage(code)).toMatch(/sign in with your password/i);
  });

  it("anything else -> generic provider failure, never echoing the raw code", () => {
    const message = oauthErrorMessage("<script>x</script>");
    expect(message).toMatch(/didn't work/i);
    expect(message).not.toContain("script");
  });
});

describe("authFailureMessage", () => {
  it.each([
    [{ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, "Invalid email or password."],
    [
      { status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
      "An account with this email already exists. Sign in instead.",
    ],
    [
      { status: 422, code: "USER_ALREADY_EXISTS" },
      "An account with this email already exists. Sign in instead.",
    ],
    [{ status: 429 }, "Too many attempts. Wait a few seconds and try again."],
    [{ status: 500 }, "Something went wrong. Please try again."],
  ])("%j -> %s", (failure, message) => {
    expect(authFailureMessage(failure)).toBe(message);
  });
});
