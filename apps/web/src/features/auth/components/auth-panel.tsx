import type { ReactNode } from "react";

interface AuthPanelProps {
  title: string;
  /** Shown above everything else (e.g. an OAuth error). */
  notice?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}

/** Centered, phone-first card shared by the sign-in and sign-up pages. */
export function AuthPanel({ title, notice, children, footer }: AuthPanelProps) {
  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-6">
      <header className="flex flex-col gap-1 text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Vaultkeeper</p>
        <h1 className="text-2xl font-bold">{title}</h1>
      </header>
      {notice}
      {children}
      <div className="flex flex-col gap-2 text-center text-sm text-muted">{footer}</div>
    </section>
  );
}

/** "or" separator between the OAuth buttons and the email form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      or use email
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
