import { createFileRoute } from "@tanstack/react-router";
import { GroupDetailContainer } from "../../../features/groups/containers/group-detail-container";

export const Route = createFileRoute("/_authed/groups/$groupId")({
  component: GroupRoute,
});

function GroupRoute() {
  const { groupId } = Route.useParams();
  return <GroupDetailContainer key={groupId} groupId={groupId} />;
}
