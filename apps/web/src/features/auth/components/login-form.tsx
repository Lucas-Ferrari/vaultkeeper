import { zodResolver } from "@hookform/resolvers/zod";
import { signInInput, type SignInInput } from "@vaultkeeper/shared/schemas/auth";
import { useForm } from "react-hook-form";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { TextField } from "../../../shared/ui/text-field";

interface LoginFormProps {
  onSubmit: (values: SignInInput) => void;
  pending: boolean;
  error?: string | undefined;
}

/** Email/password sign-in, validated by the shared schema (same rules as the API). */
export function LoginForm({ onSubmit, pending, error }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(signInInput) });

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      {error && <Alert>{error}</Alert>}
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
