import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";
import { SOCIAL_PROVIDER, SOCIAL_PROVIDER_LABEL, type SocialProvider } from "../lib/providers";

interface SocialSignInProps {
  onSelect: (provider: SocialProvider) => void;
  disabled?: boolean;
}

const PROVIDERS: readonly SocialProvider[] = [SOCIAL_PROVIDER.GOOGLE, SOCIAL_PROVIDER.DISCORD];

/** Google/Discord: the primary way in (design 08), so they come before the email form. */
export function SocialSignIn({ onSelect, disabled = false }: SocialSignInProps) {
  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.map((provider) => (
        <Button
          key={provider}
          variant={BUTTON_VARIANT.SECONDARY}
          disabled={disabled}
          onClick={() => onSelect(provider)}
        >
          Continue with {SOCIAL_PROVIDER_LABEL[provider]}
        </Button>
      ))}
    </div>
  );
}
