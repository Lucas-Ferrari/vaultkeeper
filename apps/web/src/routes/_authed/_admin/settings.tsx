import { createFileRoute } from "@tanstack/react-router";

/** Global settings (admin). Placeholder until the settings feature lands (phase 6). */
export const Route = createFileRoute("/_authed/_admin/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted">
        Global settings (MC to MP rate, vault count) will be managed here.
      </p>
    </section>
  );
}
