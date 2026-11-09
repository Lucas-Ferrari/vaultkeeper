import { zodResolver } from "@hookform/resolvers/zod";
import { AUTH_LIMIT } from "@vaultkeeper/shared/constants";
import { signUpInput, type SignUpInput } from "@vaultkeeper/shared/schemas/auth";
import { useForm } from "react-hook-form";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { TextField } from "../../../shared/ui/text-field";

interface RegisterFormProps {
  onSubmit: (values: SignUpInput) => void;
  pending: boolean;
  error?: string | undefined;
}

/** Email/password sign-up (R-AUTH-1 S1). No email verification step exists (no SMTP). */
export function RegisterForm({ onSubmit, pending, error }: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(signUpInput) });

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      {error && <Alert>{error}</Alert>}
      <TextField
        label="Name"
        autoComplete="name"
        error={errors.name?.message}
        {...register("name")}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${AUTH_LIMIT.PASSWORD_MIN} characters.`}
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
