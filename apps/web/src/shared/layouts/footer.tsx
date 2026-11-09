/** R-DOC-2: shown on every page, signed in or not. */
export const NON_AFFILIATION_DISCLAIMER = "Not affiliated with Webzen or MEGADEV";

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">
      <p>{NON_AFFILIATION_DISCLAIMER}</p>
    </footer>
  );
}
