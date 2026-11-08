import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SignInInput, SignUpInput } from "@vaultkeeper/shared/schemas/auth";
import { authClient } from "../../../shared/lib/auth-client";
import { assignLocation } from "../../../shared/lib/browser";
import { AuthFailure } from "../lib/messages";
import { OAUTH_ERROR_CALLBACK_PATH, type SocialProvider } from "../lib/providers";

interface BetterFetchFailure {
  status: number;
  code?: string | undefined;
}

function failIf(error: BetterFetchFailure | null): void {
  if (error) throw new AuthFailure({ status: error.status, code: error.code });
}

/**
 * A different user may be signing in or out: drop EVERY cached query (session and any per-user
 * data) before navigating, so guards and pages refetch as the new identity.
 */
function useResetCache() {
  const queryClient = useQueryClient();
  return () => queryClient.clear();
}

export function useSignIn() {
  const resetCache = useResetCache();
  return useMutation({
    mutationFn: async (input: SignInInput) => {
      const { error } = await authClient.signIn.email(input);
      failIf(error);
    },
    onSuccess: resetCache,
  });
}

export function useSignUp() {
  const resetCache = useResetCache();
  return useMutation({
    mutationFn: async (input: SignUpInput) => {
      const { error } = await authClient.signUp.email(input);
      failIf(error);
    },
    onSuccess: resetCache,
  });
}

export function useSignOut() {
  const resetCache = useResetCache();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      failIf(error);
    },
    onSuccess: resetCache,
  });
}

export interface SocialSignInInput {
  provider: SocialProvider;
  /** In-app path Better Auth returns to after a successful provider flow. */
  callbackPath: string;
}

/** Starts a Google/Discord flow: asks Better Auth for the provider URL, then leaves the SPA. */
export function useSocialSignIn() {
  return useMutation({
    mutationFn: async ({ provider, callbackPath }: SocialSignInInput) => {
      const { data, error } = await authClient.signIn.social({
        provider,
        callbackURL: callbackPath,
        errorCallbackURL: OAUTH_ERROR_CALLBACK_PATH,
        disableRedirect: true,
      });
      failIf(error);
      if (data?.url) assignLocation(data.url);
    },
  });
}
