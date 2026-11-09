import { createFileRoute } from "@tanstack/react-router";
import { GroupsListContainer } from "../../../features/groups/containers/groups-list-container";

export const Route = createFileRoute("/_authed/groups/")({
  component: GroupsListContainer,
});
