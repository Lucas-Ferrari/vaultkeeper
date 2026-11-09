import { describe, expect, it } from "vitest";
import { AUTH_LIMIT } from "../constants";
import { signInInput, signUpInput } from "./auth";

/** Email/password form rules (R-AUTH-1). Same limits as the Better Auth server config. */
describe("auth limits", () => {
  it("passwords are 10..128 chars, names 1..60 (design 08)", () => {
    expect(AUTH_LIMIT).toEqual({ PASSWORD_MIN: 10, PASSWORD_MAX: 128, NAME_MAX: 60 });
  });
});

describe("signInInput", () => {
  it("accepts an email and any non-empty password; trims and lowercases the email", () => {
    expect(signInInput.parse({ email: "  Ana@X.com ", password: "x" })).toEqual({
      email: "ana@x.com",
      password: "x",
    });
  });

  it.each([
    [{ email: "nope", password: "secret-password" }, "email", "Enter a valid email"],
    [{ email: "", password: "secret-password" }, "email", "Enter a valid email"],
    [{ email: "a@x.com", password: "" }, "password", "Enter your password"],
  ])("rejects %j at %s", (value, path, message) => {
    const result = signInInput.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: [path], message })]);
  });
});

describe("signUpInput", () => {
  const valid = { name: " Ana ", email: "ana@x.com", password: "0123456789" };

  it("accepts a 10-char password and trims the name", () => {
    expect(signUpInput.parse(valid)).toEqual({ ...valid, name: "Ana" });
  });

  it("accepts a 128-char password", () => {
    expect(signUpInput.safeParse({ ...valid, password: "x".repeat(128) }).success).toBe(true);
  });

  it.each([
    [{ password: "012345678" }, "password", "Use at least 10 characters"],
    [{ password: "x".repeat(129) }, "password", "Use at most 128 characters"],
    [{ name: "   " }, "name", "Enter your name"],
    [{ name: "x".repeat(61) }, "name", "Use at most 60 characters"],
    [{ email: "ana@" }, "email", "Enter a valid email"],
  ])("rejects %j at %s", (override, path, message) => {
    const result = signUpInput.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: [path], message })]);
  });
});
