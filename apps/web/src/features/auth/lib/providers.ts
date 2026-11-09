/** OAuth providers offered on the sign-in/sign-up pages (design 08: the primary login). */
export const SOCIAL_PROVIDER = {
  GOOGLE: "google",
  DISCORD: "discord",
} as const;
export type SocialProvider = (typeof SOCIAL_PROVIDER)[keyof typeof SOCIAL_PROVIDER];

export const SOCIAL_PROVIDER_LABEL: Readonly<Record<SocialProvider, string>> = {
  [SOCIAL_PROVIDER.GOOGLE]: "Google",
  [SOCIAL_PROVIDER.DISCORD]: "Discord",
};

/** Where Better Auth sends the browser when the provider flow fails (?error=...). */
export const OAUTH_ERROR_CALLBACK_PATH = "/login";
