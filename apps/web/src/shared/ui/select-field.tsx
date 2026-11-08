import { useId, type ComponentProps } from "react";
import { cn } from "../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "id" | "children"> {
  label: string;
  options: readonly SelectOption[];
  error?: string | undefined;
}

/** Labelled native select (44 px target, keyboard and screen-reader friendly by default). */
export function SelectField({
  label,
  options,
  error,
  className,
  ...selectProps
}: SelectFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
        className={cn(
          "min-h-11 rounded-lg border border-border bg-surface-raised px-3 text-base",
          "focus:border-primary focus:outline-none",
          error && "border-danger",
          className,
        )}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={messageId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
