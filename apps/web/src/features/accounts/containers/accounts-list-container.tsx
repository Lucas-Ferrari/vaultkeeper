import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { gameAccountName } from "@vaultkeeper/shared/schemas/game-accounts";
import { Alert } from "../../../shared/ui/alert";
import { useCreateAccount } from "../api/mutations";
import { accountsQueryOptions } from "../api/queries";
import { NameForm } from "../../../shared/ui/name-form";
import { accountErrorMessage } from "../lib/messages";

/** /accounts: own game accounts + create (R-GA-1). */
export function AccountsListContainer() {
  const accounts = useQuery(accountsQueryOptions);
  const create = useCreateAccount();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Game accounts</h1>
      <NameForm
        schema={gameAccountName}
        label="Account name"
        submitLabel="Add account"
        pending={create.isPending}
        onSubmit={(name) =>
          create.mutateAsync({ name }).then(
            () => true,
            () => false,
          )
        }
      />
      {create.error && <Alert>{accountErrorMessage(create.error)}</Alert>}
      {accounts.isError && <Alert>Could not load your accounts.</Alert>}
      {accounts.data?.length === 0 && (
        <p className="text-muted">No game accounts yet. Add one to get its vaults.</p>
      )}
      <ul className="flex flex-col gap-2">
        {accounts.data?.map((account) => (
          <li key={account.id}>
            <Link
              to="/accounts/$accountId"
              params={{ accountId: account.id }}
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              {account.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
