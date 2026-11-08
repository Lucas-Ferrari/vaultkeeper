import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ROLE } from "@vaultkeeper/shared/constants";
import type { MeResponse } from "@vaultkeeper/shared/schemas/me";
import { useSignOut } from "../api/mutations";
import { AuthedHeader } from "../components/authed-header";

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
          <Link to="/" className="text-lg font-bold">
            Vaultkeeper
          </Link>
        }
        nav={
          me.role === ROLE.ADMIN && (
            <nav aria-label="Admin">
              <Link
                to="/catalog"
                className="text-sm font-semibold text-muted hover:text-foreground"
              >
                Catalog
              </Link>
            </nav>
          )
        }
        email={me.email}
        onSignOut={onSignOut}
        signingOut={signOut.isPending}
      />
      <Outlet />
    </>
  );
}
