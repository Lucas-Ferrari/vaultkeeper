const HOME = "/";
const PROBE_ORIGIN = "http://vaultkeeper.invalid";
/** Going "back" to these after signing in would loop. */
const AUTH_PATHS: ReadonlySet<string> = new Set(["/login", "/register"]);

/**
 * Where to go after signing in. Only same-origin, in-app paths are honoured so a crafted
 * `?redirect=//evil.example` can never bounce a fresh session off-site; anything else -> "/".
 */
export function safeRedirectPath(path: string | undefined): string {
  if (!path?.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return HOME;
  let url: URL;
  try {
    url = new URL(path, PROBE_ORIGIN);
  } catch {
    return HOME;
  }
  if (url.origin !== PROBE_ORIGIN || AUTH_PATHS.has(url.pathname)) return HOME;
  return path;
}
