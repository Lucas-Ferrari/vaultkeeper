import type { ReactNode } from "react";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";

interface AuthedHeaderProps {
  /** Home link (router-aware, provided by the container). */
  brand: ReactNode;
  email: string;
  onSignOut: () => void;
  signingOut: boolean;
}

/**
 * Top bar of every signed-in page. Deliberately has no "link Google/Discord" action: linking into
 * a password account is refused server-side (R-AUTH-7), so the UI must not offer it.
 */
export function AuthedHeader({ brand, email, onSignOut, signingOut }: AuthedHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      {brand}
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm text-muted">{email}</span>
        <Button variant={BUTTON_VARIANT.GHOST} disabled={signingOut} onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
