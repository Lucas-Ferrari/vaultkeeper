import { zodResolver } from "@hookform/resolvers/zod";
import { mcToMpRate, vaultCount } from "@vaultkeeper/shared/schemas/settings";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../shared/ui/button";
import { TextField } from "../../../shared/ui/text-field";
import { fieldIssues } from "../lib/messages";

/** Same rules as PATCH /admin/settings (R-SET-1): rate > 0 exact decimal, vaults 1..50 integer. */
const settingsFormSchema = z.object({ mcToMpRate, vaultCount });
export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

interface SettingsFormProps {
  defaults: SettingsFormValues;
  pending: boolean;
  /** Last failed save: its 422 field issues are shown on the fields. */
  serverError: unknown;
  onSubmit: (values: SettingsFormValues) => void;
}

export function SettingsForm({ defaults, pending, serverError, onSubmit }: SettingsFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    for (const [field, message] of fieldIssues(serverError)) {
      if (field === "mcToMpRate" || field === "vaultCount") setError(field, { message });
    }
  }, [serverError, setError]);

  return (
    <form noValidate className="flex max-w-md flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="MC to MP rate"
        inputMode="decimal"
        hint="1 MC is worth this many MP. Changes every MP value on the next load."
        error={errors.mcToMpRate?.message}
        {...register("mcToMpRate")}
      />
      <TextField
        label="Vaults per account"
        type="number"
        min={1}
        max={50}
        step={1}
        hint="Lowering it removes empty vaults above the limit; vaults with items stay, flagged."
        error={errors.vaultCount?.message}
        {...register("vaultCount", { valueAsNumber: true })}
      />
      <Button type="submit" className="self-start" disabled={pending}>
        Save settings
      </Button>
    </form>
  );
}
