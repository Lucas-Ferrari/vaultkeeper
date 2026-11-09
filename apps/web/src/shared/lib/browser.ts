/** Full-page navigation to another origin (OAuth providers). Wrapped so tests can observe it. */
export function assignLocation(url: string): void {
  window.location.assign(url);
}
