import { createFileRoute } from "@tanstack/react-router";
import { StockCreateContainer } from "../../../features/stock/containers/stock-form-container";

export const Route = createFileRoute("/_authed/stock/new")({
  component: StockCreateContainer,
});
