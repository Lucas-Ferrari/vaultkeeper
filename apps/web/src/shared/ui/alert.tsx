import type { ReactNode } from "react";

interface AlertProps {
  children: ReactNode;
}

/** Announced error/notice block (role="alert"). */
export function Alert({ children }: AlertProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger bg-surface-raised px-3 py-2 text-sm text-foreground"
    >
      {children}
    </div>
  );
}
