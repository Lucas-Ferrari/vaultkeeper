import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { characterName } from "@vaultkeeper/shared/schemas/game-accounts";
import { Alert } from "../../../shared/ui/alert";
import { ConfirmButton } from "../../../shared/ui/confirm-button";
import { useCreateCharacter, useDeleteAccount } from "../api/mutations";
import { accountQueryOptions, storageQueryOptions } from "../api/queries";
import { NameForm } from "../../../shared/ui/name-form";
import { StorageList } from "../components/storage-list";
import { accountErrorMessage } from "../lib/messages";

/** /accounts/$accountId: characters, storage locations, delete (R-GA-2..4). */
export function AccountDetailContainer({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const account = useQuery(accountQueryOptions(accountId));
  const storage = useQuery(storageQueryOptions(accountId));
  const addCharacter = useCreateCharacter(accountId);
  const remove = useDeleteAccount(accountId);

  if (account.isError) return <Alert>{accountErrorMessage(account.error)}</Alert>;
  if (!account.data) return <p className="text-muted">Loading…</p>;

  return (
    <section className="flex flex-col gap-6">
      <Link to="/accounts" className="text-sm text-primary">
        ← Game accounts
      </Link>
      <h1 className="text-2xl font-bold">{account.data.name}</h1>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Characters</h2>
        <NameForm
          schema={characterName}
          label="Character name"
          submitLabel="Add character"
          pending={addCharacter.isPending}
          onSubmit={(name) =>
            addCharacter.mutateAsync({ name }).then(
              () => true,
              () => false,
            )
          }
        />
        {addCharacter.error && (
          <Alert>{accountErrorMessage(addCharacter.error, "character")}</Alert>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Storage</h2>
        {storage.isError && <Alert>Could not load the storage.</Alert>}
        {storage.data && (
          <StorageList
            locations={storage.data.locations}
            renderLink={(location) => (
              <Link
                to="/accounts/$accountId/locations/$locationId"
                params={{ accountId, locationId: location.id }}
                className="font-medium text-primary hover:underline"
              >
                {location.label}
              </Link>
            )}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {remove.error && <Alert>{accountErrorMessage(remove.error)}</Alert>}
        <ConfirmButton
          label="Delete account"
          prompt="Delete this account, its characters and vaults?"
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(undefined, { onSuccess: () => navigate({ to: "/accounts" }) })
          }
        />
      </div>
    </section>
  );
}
