import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client (design 08). Same origin as the SPA (Caddy in prod, Vite proxy in dev), so
 * the session cookie is first-party. No email-verification or reset helpers are used (no SMTP).
 */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [adminClient()],
});
