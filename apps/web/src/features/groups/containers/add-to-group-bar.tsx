import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { SelectField } from "../../../shared/ui/select-field";
import { useAddToGroup } from "../api/mutations";
import { groupsQueryOptions } from "../api/queries";
import { groupErrorMessage } from "../lib/messages";

interface AddToGroupBarProps {
  /** Selected stock entry ids, in selection order. */
  entryIds: readonly string[];
  onAdded: () => void;
}

/** Bulk "add to group" for the stock list selection (R-GRP-2 S7: one all-or-nothing call). */
export function AddToGroupBar({ entryIds, onAdded }: AddToGroupBarProps) {
  // Groups are only needed once something is selected.
  const groups = useQuery({ ...groupsQueryOptions, enabled: entryIds.length > 0 });
  const add = useAddToGroup();
  const [groupId, setGroupId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  if (entryIds.length === 0) {
    return notice ? (
      <p role="status" className="text-sm text-muted">
        {notice}
      </p>
    ) : null;
  }

  const target = groups.data?.find((group) => group.id === groupId);
  return (
    <section
      aria-label="Selection"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-primary p-3"
    >
      <span className="min-h-11 content-center text-sm font-semibold">
        {entryIds.length} selected
      </span>
      <SelectField
        label="Group"
        value={groupId}
        options={[
          { value: "", label: "Choose a group" },
          ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.name })),
        ]}
        onChange={(event) => setGroupId(event.target.value)}
      />
      <Button
        disabled={!target || add.isPending}
        onClick={() => {
          if (!target) return;
          add.mutate(
            { groupId: target.id, stockEntryIds: [...entryIds] },
            {
              onSuccess: () => {
                setNotice(`Added ${entryIds.length} items to ${target.name}.`);
                onAdded();
              },
            },
          );
        }}
      >
        Add to group
      </Button>
      {groups.data?.length === 0 && <p className="text-sm text-muted">Create a group first.</p>}
      {add.error && <Alert>{groupErrorMessage(add.error)}</Alert>}
    </section>
  );
}
