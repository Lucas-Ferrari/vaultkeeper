import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../shared/ui/button";
import { TextField } from "../../../shared/ui/text-field";

interface NameFormProps {
  /** Shared name schema (gameAccountName / characterName), so the UI applies the API's rules. */
  schema: z.ZodType<string, string>;
  label: string;
  submitLabel: string;
  pending: boolean;
  /** Resolves true when saved (the field is then cleared). */
  onSubmit: (name: string) => Promise<boolean>;
}

/**
 * One-field create form (new account, new character). After a save the form is REMOUNTED (key)
 * instead of `reset()`: under the React Compiler, RHF's reset left the uncontrolled input stale.
 */
export function NameForm(props: NameFormProps) {
  const [round, setRound] = useState(0);
  return <NameFormFields key={round} {...props} onSaved={() => setRound((n) => n + 1)} />;
}

function NameFormFields({
  schema,
  label,
  submitLabel,
  pending,
  onSubmit,
  onSaved,
}: NameFormProps & { onSaved: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ name: string }>({
    resolver: zodResolver(z.object({ name: schema })),
    defaultValues: { name: "" },
  });

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit(async ({ name }) => {
        if (await onSubmit(name)) onSaved();
      })}
    >
      <TextField label={label} error={errors.name?.message} {...register("name")} />
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
