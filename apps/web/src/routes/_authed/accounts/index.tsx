import { createFileRoute } from "@tanstack/react-router";
import { AccountsListContainer } from "../../../features/accounts/containers/accounts-list-container";

export const Route = createFileRoute("/_authed/accounts/")({
  component: AccountsListContainer,
});
