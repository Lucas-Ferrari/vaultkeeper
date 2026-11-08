import { useId, type ComponentProps } from "react";
import { cn } from "../lib/cn";

interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Labelled input with its validation message wired for screen readers. */
export function TextField({ label, error, hint, className, ...inputProps }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          "min-h-11 rounded-lg border border-border bg-surface-raised px-3 text-base",
          "focus:border-primary focus:outline-none",
          error && "border-danger",
          className,
        )}
        {...inputProps}
      />
      {message && (
        <p id={messageId} className={cn("text-xs", error ? "text-danger" : "text-muted")}>
          {message}
        </p>
      )}
    </div>
  );
}
