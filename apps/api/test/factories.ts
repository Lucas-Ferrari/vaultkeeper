import { parseEnv, type Env } from "../src/config/env";

/** Base URL the in-process test app pretends to be served at (Better Auth baseURL). */
export const TEST_PUBLIC_URL = "http://localhost:3000";
export const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";

/** A valid Env for a test app on `databaseUrl` (design 15: fixed test secret, no OAuth). */
export function testEnv(databaseUrl: string, overrides: Record<string, string> = {}): Env {
  const result = parseEnv({
    NODE_ENV: "test",
    PUBLIC_URL: TEST_PUBLIC_URL,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    ...overrides,
  });
  if (!result.success) throw new Error(`invalid test env: ${result.error.message}`);
  return result.data;
}

export interface UserInput {
  email: string;
  password: string;
  name: string;
}

let userSeq = 0;

/** Unique sign-up input per call (emails never collide inside one test database). */
export function userInput(overrides: Partial<UserInput> = {}): UserInput {
  userSeq += 1;
  return {
    email: `user${userSeq}-${process.pid}@example.com`,
    password: "correct-horse-battery",
    name: `User ${userSeq}`,
    ...overrides,
  };
}
