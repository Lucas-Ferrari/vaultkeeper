import { Link, useNavigate } from "@tanstack/react-router";
import type { SignInInput } from "@vaultkeeper/shared/schemas/auth";
import { Alert } from "../../../shared/ui/alert";
import { useSignIn, useSocialSignIn } from "../api/mutations";
import { AuthPanel, OrDivider } from "../components/auth-panel";
import { LoginForm } from "../components/login-form";
import { SocialSignIn } from "../components/social-sign-in";
import { oauthErrorMessage } from "../lib/messages";
import type { SocialProvider } from "../lib/providers";
import { safeRedirectPath } from "../lib/redirect";
import type { AuthSearch } from "../lib/search";

/** Sign-in page (R-AUTH-1, R-AUTH-6 S4: no reset flow, only "ask an admin"). */
export function LoginContainer({ redirect, error }: AuthSearch) {
  const navigate = useNavigate();
  const signIn = useSignIn();
  const social = useSocialSignIn();
  const target = safeRedirectPath(redirect);
  const oauthError = oauthErrorMessage(error);

  const onSubmit = (values: SignInInput) => {
    signIn.mutate(values, { onSuccess: () => navigate({ href: target }) });
  };
  const onSocial = (provider: SocialProvider) => {
    social.mutate({ provider, callbackPath: target });
  };

  return (
    <AuthPanel
      title="Sign in"
      notice={(oauthError ?? social.error) && <Alert>{oauthError ?? social.error?.message}</Alert>}
      footer={
        <>
          <p>Forgot password? Ask an admin to reset it for you.</p>
          <p>
            New here?{" "}
            <Link
              to="/register"
              search={redirect === undefined ? {} : { redirect }}
              className="font-semibold text-primary"
            >
              Create an account
            </Link>
          </p>
        </>
      }
    >
      <SocialSignIn onSelect={onSocial} disabled={social.isPending} />
      <OrDivider />
      <LoginForm onSubmit={onSubmit} pending={signIn.isPending} error={signIn.error?.message} />
    </AuthPanel>
  );
}
