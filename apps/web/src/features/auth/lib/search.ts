import { z } from "zod";

/** Search params of /login and /register. Bad values are dropped, never thrown. */
export const authSearch = z.object({
  /** In-app path to return to after signing in (sanitized by safeRedirectPath). */
  redirect: z.string().optional().catch(undefined),
  /** Better Auth's OAuth error callback code (/login only). */
  error: z.string().optional().catch(undefined),
});
export type AuthSearch = z.infer<typeof authSearch>;
