import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * Fake Google/Discord OAuth providers (MSW, no network, no real OAuth apps), from spike 2.1.
 * The authorization `code` selects the identity; Discord's access token echoes the code so
 * /users/@me can resolve it again. Call `oauthServer.listen()` in beforeAll of the test file.
 */

export const OAUTH_BASE_URL = "http://localhost:3000";

export const PROVIDER = { GOOGLE: "google", DISCORD: "discord" } as const;
export type Provider = (typeof PROVIDER)[keyof typeof PROVIDER];

/** Env pairs that turn both providers on in createAuth (any values: the providers are fake). */
export const FAKE_OAUTH_ENV = {
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  DISCORD_CLIENT_ID: "discord-client-id",
  DISCORD_CLIENT_SECRET: "discord-client-secret",
} as const;

export interface FakeIdentity {
  /** Provider-side subject (Google `sub`, Discord snowflake id). */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const identities = new Map<string, FakeIdentity>();
let codeSeq = 0;

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Google's code flow only DECODES the id_token it got from the token endpoint over TLS
 * (@better-auth/core social-providers/google.mjs getUserInfo -> jose.decodeJwt), so an
 * unsigned token is enough here.
 */
function fakeGoogleIdToken(identity: FakeIdentity): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "RS256", typ: "JWT", kid: "fake" });
  const payload = base64url({
    iss: "https://accounts.google.com",
    aud: FAKE_OAUTH_ENV.GOOGLE_CLIENT_ID,
    sub: identity.subject,
    email: identity.email,
    email_verified: identity.emailVerified,
    name: identity.name,
    iat: now,
    exp: now + 3600,
  });
  return `${header}.${payload}.fake-signature`;
}

async function codeFrom(request: Request): Promise<string> {
  const form = new URLSearchParams(await request.text());
  return form.get("code") ?? "";
}

export const oauthServer = setupServer(
  http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
    const identity = identities.get(await codeFrom(request));
    if (!identity) return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
    return HttpResponse.json({
      access_token: `google-at-${identity.subject}`,
      id_token: fakeGoogleIdToken(identity),
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
    });
  }),
  http.post("https://discord.com/api/oauth2/token", async ({ request }) => {
    const code = await codeFrom(request);
    if (!identities.has(code))
      return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
    return HttpResponse.json({
      access_token: code,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "identify email",
    });
  }),
  http.get("https://discord.com/api/users/@me", ({ request }) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const identity = identities.get(token);
    if (!identity) return HttpResponse.json({ message: "401: Unauthorized" }, { status: 401 });
    return HttpResponse.json({
      id: identity.subject,
      username: identity.name,
      global_name: identity.name,
      discriminator: "0",
      avatar: null,
      email: identity.email,
      verified: identity.emailVerified,
    });
  }),
);

function registerIdentity(identity: FakeIdentity): string {
  codeSeq += 1;
  const code = `code-${codeSeq}`;
  identities.set(code, identity);
  return code;
}

/** Anything that serves Better Auth routes: an auth instance (`handler`) or the Hono app. */
export interface AuthHandler {
  handler(request: Request): Promise<Response>;
}

/** `name=value` pairs from Set-Cookie, joined into a Cookie header. Cleared cookies are dropped. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0] ?? "")
    .filter((pair) => pair.length > 0 && !pair.endsWith("="))
    .join("; ");
}

function joinCookies(...cookies: (string | undefined)[]): string {
  return cookies.filter((cookie): cookie is string => !!cookie).join("; ");
}

export interface OAuthResult {
  status: number;
  /** Where Better Auth redirects the browser after the callback. */
  location: URL;
  /** Session cookies set by the callback ("" when no session was created). */
  sessionCookie: string;
}

export interface ProviderFlowOptions {
  /** "/sign-in/social" (default) or "/link-social" (explicit linking; needs `cookie`). */
  startPath?: "/sign-in/social" | "/link-social";
  /** Session cookie of an already signed-in user (link flow). */
  cookie?: string;
}

/**
 * Social round trip up to the raw callback response: start -> fake provider ->
 * /callback/:provider. Use it when the callback may answer without a redirect (an APIError in the
 * explicit link flow comes back as a JSON error response).
 */
export async function runProviderFlow(
  target: AuthHandler,
  provider: Provider,
  identity: FakeIdentity,
  options: ProviderFlowOptions = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json", origin: OAUTH_BASE_URL });
  if (options.cookie) headers.set("cookie", options.cookie);
  const startPath = options.startPath ?? "/sign-in/social";
  const start = await target.handler(
    new Request(`${OAUTH_BASE_URL}/api/auth${startPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        callbackURL: `${OAUTH_BASE_URL}/app`,
        errorCallbackURL: `${OAUTH_BASE_URL}/login`,
      }),
    }),
  );
  if (start.status !== 200) throw new Error(`${startPath} failed: ${start.status}`);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  if (!state) throw new Error("no state in authorization URL");

  const code = registerIdentity(identity);
  return target.handler(
    new Request(`${OAUTH_BASE_URL}/api/auth/callback/${provider}?code=${code}&state=${state}`, {
      headers: { cookie: joinCookies(options.cookie, cookieHeader(start)) },
    }),
  );
}

/** Full social round trip that must end in a redirect (success or error callback URL). */
export async function signInWithProvider(
  target: AuthHandler,
  provider: Provider,
  identity: FakeIdentity,
  options: ProviderFlowOptions = {},
): Promise<OAuthResult> {
  const callback = await runProviderFlow(target, provider, identity, options);
  const location = callback.headers.get("location");
  if (!location) throw new Error(`callback did not redirect: ${callback.status}`);
  return {
    status: callback.status,
    location: new URL(location, OAUTH_BASE_URL),
    sessionCookie: cookieHeader(callback)
      .split("; ")
      .filter((pair) => pair.includes("session_"))
      .join("; "),
  };
}
