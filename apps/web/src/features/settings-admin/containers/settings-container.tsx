import { useQuery } from "@tanstack/react-query";
import { Alert } from "../../../shared/ui/alert";
import { useUpdateSettings } from "../api/mutations";
import { settingsQueryOptions } from "../api/queries";
import { SettingsForm } from "../components/settings-form";
import { fieldIssues, settingsErrorMessage } from "../lib/messages";

/** "7.5000" (numeric(8,4)) -> "7.5" for editing. */
function trimRate(rate: string): string {
  return rate.includes(".") ? rate.replace(/0+$/, "").replace(/\.$/, "") : rate;
}

/** /settings (admin): MC -> MP rate and vault count (R-SET-1..3). */
export function SettingsContainer() {
  const settings = useQuery(settingsQueryOptions);
  const update = useUpdateSettings();
  const issues = fieldIssues(update.error);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      {settings.isError && <Alert>Could not load the settings.</Alert>}
      {settings.data && (
        <SettingsForm
          key={settings.data.updatedAt}
          defaults={{
            mcToMpRate: trimRate(settings.data.mcToMpRate),
            vaultCount: settings.data.vaultCount,
          }}
          pending={update.isPending}
          serverError={update.error}
          onSubmit={(values) => update.mutate(values)}
        />
      )}
      {update.error && issues.size === 0 && <Alert>{settingsErrorMessage(update.error)}</Alert>}
      {update.isSuccess && (
        <p role="status" className="text-sm text-muted">
          Settings saved.
        </p>
      )}
    </section>
  );
}
