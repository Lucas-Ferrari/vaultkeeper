import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ROLE } from "@vaultkeeper/shared/constants";
import type { MeResponse } from "@vaultkeeper/shared/schemas/me";
import { useSignOut } from "../api/mutations";
import { AuthedHeader } from "../components/authed-header";

const NAV_LINK =
  "inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-sm font-semibold text-muted hover:text-foreground";

interface AuthedLayoutContainerProps {
  me: MeResponse;
}

/** Shell of every signed-in page: header with sign-out, then the child route. */
export function AuthedLayoutContainer({ me }: AuthedLayoutContainerProps) {
  const navigate = useNavigate();
  const signOut = useSignOut();

  const onSignOut = () => {
    signOut.mutate(undefined, { onSuccess: () => navigate({ to: "/login" }) });
  };

  return (
    <>
      <AuthedHeader
        brand={
          <Link to="/" className="inline-flex min-h-11 items-center text-lg font-bold">
            Vaultkeeper
          </Link>
        }
        nav={
          <>
            <nav aria-label="Main" className="flex flex-wrap items-center gap-x-3">
              <Link to="/accounts" className={NAV_LINK}>
                Accounts
              </Link>
              <Link to="/stock" className={NAV_LINK}>
                Stock
              </Link>
              <Link to="/groups" className={NAV_LINK}>
                Groups
              </Link>
            </nav>
            {me.role === ROLE.ADMIN && (
              <nav aria-label="Admin" className="flex flex-wrap items-center gap-x-3">
                <Link to="/catalog" className={NAV_LINK}>
                  Catalog
                </Link>
                <Link to="/settings" className={NAV_LINK}>
                  Settings
                </Link>
              </nav>
            )}
          </>
        }
        email={me.email}
        onSignOut={onSignOut}
        signingOut={signOut.isPending}
      />
      <Outlet />
    </>
  );
}
