import { ROLE } from "@vaultkeeper/shared/constants";
import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import type { MeResponse } from "@vaultkeeper/shared/schemas/me";
import { http, HttpResponse, type AnyHandler } from "msw";

/**
 * In-memory stand-in for Better Auth (/api/auth/*) + GET /api/v1/me (design 16: containers hit
 * MSW, never a real API). Bodies follow the real shapes: /me is typed by the shared contract,
 * auth errors use Better Auth's { code, message }.
 */

export const TEST_PASSWORD = "correct-horse-battery";

export interface FakeAccount {
  me: MeResponse;
  password: string;
}

export interface SocialCall {
  provider: string;
  callbackURL: string;
  errorCallbackURL: string;
}

export interface SignUpCall {
  name: string;
  email: string;
  password: string;
}

export interface FakeAuthCalls {
  signIn: number;
  signUp: SignUpCall[];
  signOut: number;
  social: SocialCall[];
}

export interface FakeAuthApi {
  handlers: AnyHandler[];
  calls: FakeAuthCalls;
  /** Adds an account and returns it; `signedIn` makes it the current session. */
  addAccount(overrides?: Partial<MeResponse>, options?: { signedIn?: boolean }): FakeAccount;
  readonly current: MeResponse | null;
}

const unauthenticated: ApiErrorBody = {
  error: { code: ERROR_CODE.UNAUTHENTICATED, message: "Sign in required", requestId: "req-test" },
};

let seq = 0;

export function fakeAuthApi(): FakeAuthApi {
  const accounts = new Map<string, FakeAccount>();
  let current: MeResponse | null = null;
  const calls: FakeAuthCalls = { signIn: 0, signUp: [], signOut: 0, social: [] };

  function addAccount(
    overrides: Partial<MeResponse> = {},
    options: { signedIn?: boolean } = {},
  ): FakeAccount {
    seq += 1;
    const account: FakeAccount = {
      me: {
        id: `user-${seq}`,
        email: `user${seq}@example.com`,
        name: `User ${seq}`,
        role: ROLE.USER,
        ...overrides,
      },
      password: TEST_PASSWORD,
    };
    accounts.set(account.me.email, account);
    if (options.signedIn) current = account.me;
    return account;
  }

  const handlers: AnyHandler[] = [
    http.get("/api/v1/me", () =>
      current ? HttpResponse.json(current) : HttpResponse.json(unauthenticated, { status: 401 }),
    ),
    http.post("/api/auth/sign-in/email", async ({ request }) => {
      calls.signIn += 1;
      const body = (await request.json()) as { email: string; password: string };
      const account = accounts.get(body.email);
      if (!account || account.password !== body.password) {
        return HttpResponse.json(
          { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
          { status: 401 },
        );
      }
      current = account.me;
      return HttpResponse.json({ redirect: false, token: "t", user: account.me });
    }),
    http.post("/api/auth/sign-up/email", async ({ request }) => {
      const body = (await request.json()) as SignUpCall;
      calls.signUp.push(body);
      if (accounts.has(body.email)) {
        return HttpResponse.json(
          {
            code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            message: "User already exists. Use another email.",
          },
          { status: 422 },
        );
      }
      const account = addAccount({ email: body.email, name: body.name });
      account.password = body.password;
      current = account.me;
      return HttpResponse.json({ token: "t", user: account.me });
    }),
    http.post("/api/auth/sign-out", () => {
      calls.signOut += 1;
      current = null;
      return HttpResponse.json({ success: true });
    }),
    http.post("/api/auth/sign-in/social", async ({ request }) => {
      const body = (await request.json()) as SocialCall & { disableRedirect?: boolean };
      calls.social.push(body);
      return HttpResponse.json({
        url: "https://provider.example/authorize",
        redirect: !body.disableRedirect,
      });
    }),
  ];

  return {
    handlers,
    calls,
    addAccount,
    get current() {
      return current;
    },
  };
}
