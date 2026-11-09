import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createGroupInput } from "@vaultkeeper/shared/schemas/groups";
import { formatTotal, unpricedLabel } from "../../../shared/lib/format-money";
import { Alert } from "../../../shared/ui/alert";
import { NameForm } from "../../../shared/ui/name-form";
import { useCreateGroup } from "../api/mutations";
import { groupsQueryOptions } from "../api/queries";
import { groupErrorMessage } from "../lib/messages";

/** /groups: own groups with entry count and value + create (R-GRP-1). */
export function GroupsListContainer() {
  const groups = useQuery(groupsQueryOptions);
  const create = useCreateGroup();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Groups</h1>
      <NameForm
        schema={createGroupInput.shape.name}
        label="Group name"
        submitLabel="Create group"
        pending={create.isPending}
        onSubmit={(name) =>
          create.mutateAsync({ name }).then(
            () => true,
            () => false,
          )
        }
      />
      {create.error && <Alert>{groupErrorMessage(create.error)}</Alert>}
      {groups.isError && <Alert>Could not load your groups.</Alert>}
      {groups.data?.length === 0 && (
        <p className="text-muted">No groups yet. Create one to collect a set or a trade bundle.</p>
      )}
      <ul className="flex flex-col gap-2">
        {groups.data?.map((group) => (
          <li
            key={group.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <Link
              to="/groups/$groupId"
              params={{ groupId: group.id }}
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              {group.name}
            </Link>
            <span className="text-sm text-muted tabular-nums">
              {group.entryCount} entries · {formatTotal(group.totals, "totalMc")} MC
              {group.totals.partial && ` · ${unpricedLabel(group.totals.unpricedCount)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
