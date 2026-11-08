import { Link, useNavigate } from "@tanstack/react-router";
import type { SignUpInput } from "@vaultkeeper/shared/schemas/auth";
import { Alert } from "../../../shared/ui/alert";
import { useSignUp, useSocialSignIn } from "../api/mutations";
import { AuthPanel, OrDivider } from "../components/auth-panel";
import { RegisterForm } from "../components/register-form";
import { SocialSignIn } from "../components/social-sign-in";
import type { SocialProvider } from "../lib/providers";
import { safeRedirectPath } from "../lib/redirect";

interface RegisterContainerProps {
  redirect?: string | undefined;
}

/** Sign-up page (R-AUTH-1 S1). Google/Discord create the account on first sign-in too. */
export function RegisterContainer({ redirect }: RegisterContainerProps) {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const social = useSocialSignIn();
  const target = safeRedirectPath(redirect);

  const onSubmit = (values: SignUpInput) => {
    signUp.mutate(values, { onSuccess: () => navigate({ href: target }) });
  };
  const onSocial = (provider: SocialProvider) => {
    social.mutate({ provider, callbackPath: target });
  };

  return (
    <AuthPanel
      title="Create your account"
      notice={social.error && <Alert>{social.error.message}</Alert>}
      footer={
        <p>
          Already have an account?{" "}
          <Link
            to="/login"
            search={redirect === undefined ? {} : { redirect }}
            className="font-semibold text-primary"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <SocialSignIn onSelect={onSocial} disabled={social.isPending} />
      <OrDivider />
      <RegisterForm onSubmit={onSubmit} pending={signUp.isPending} error={signUp.error?.message} />
    </AuthPanel>
  );
}
