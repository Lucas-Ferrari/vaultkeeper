import { createFileRoute } from "@tanstack/react-router";
import { AccountDetailContainer } from "../../../../features/accounts/containers/account-detail-container";

export const Route = createFileRoute("/_authed/accounts/$accountId/")({
  component: AccountRoute,
});

function AccountRoute() {
  const { accountId } = Route.useParams();
  return <AccountDetailContainer key={accountId} accountId={accountId} />;
}
