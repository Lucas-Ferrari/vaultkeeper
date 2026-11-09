import { z } from "zod";
import { AUTH_LIMIT } from "../constants";

/** Trimmed, lowercased email (Better Auth stores emails lowercase). */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email" }));

/** Email/password sign-in form (R-AUTH-1). Password rules are not hinted at sign-in. */
export const signInInput = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password" }),
});
export type SignInInput = z.infer<typeof signInInput>;

/** Email/password sign-up form (R-AUTH-1 S1); same limits as the Better Auth server config. */
export const signUpInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your name" })
    .max(AUTH_LIMIT.NAME_MAX, { error: `Use at most ${AUTH_LIMIT.NAME_MAX} characters` }),
  email,
  password: z
    .string()
    .min(AUTH_LIMIT.PASSWORD_MIN, { error: `Use at least ${AUTH_LIMIT.PASSWORD_MIN} characters` })
    .max(AUTH_LIMIT.PASSWORD_MAX, { error: `Use at most ${AUTH_LIMIT.PASSWORD_MAX} characters` }),
});
export type SignUpInput = z.infer<typeof signUpInput>;
