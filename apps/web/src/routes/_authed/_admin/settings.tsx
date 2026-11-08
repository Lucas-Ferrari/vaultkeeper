import { createFileRoute } from "@tanstack/react-router";
import { SettingsContainer } from "../../../features/settings-admin/containers/settings-container";

/** Global settings (admin, task 5.11). */
export const Route = createFileRoute("/_authed/_admin/settings")({
  component: SettingsContainer,
});
