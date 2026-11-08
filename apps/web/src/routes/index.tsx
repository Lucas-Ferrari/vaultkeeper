import { createFileRoute } from "@tanstack/react-router";

/** Placeholder home; replaced by the authed dashboard (_authed/index) in the auth phase. */
export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">Vaultkeeper</h1>
      <p className="text-muted">Track your items across accounts, vaults and characters.</p>
    </section>
  );
}
