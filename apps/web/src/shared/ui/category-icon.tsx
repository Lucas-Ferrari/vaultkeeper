import { cn } from "../lib/cn";

/**
 * Original placeholder glyphs per category icon key (no Webzen assets). Unknown keys use the
 * generic chest. Paths are 24x24 strokes.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  wings: "M12 12c-3-6-7-7-10-6 1 5 4 9 10 10M12 12c3-6 7-7 10-6-1 5-4 9-10 10",
  sword: "M14 4h6v6L9 21l-6-6L14 4zM5 13l6 6",
  staff: "M7 21 17 5M15 3a3 3 0 1 0 4 4",
  armor: "M6 4h12l2 5-3 2v9H7v-9L4 9l2-5z",
  helm: "M4 14a8 8 0 0 1 16 0v4H4v-4zM12 6v12",
  shield: "M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-3z",
  jewel: "M6 3h12l3 6-9 12L3 9l3-6z",
};
const GENERIC = "M3 9h18v11H3V9zM5 4h14l2 5H3l2-5zM10 13h4";

interface CategoryIconProps {
  icon: string;
  label: string;
  className?: string;
}

/** Placeholder for items without image (R-CAT-6 S3). Exposed as an image with the item name. */
export function CategoryIcon({ icon, label, className }: CategoryIconProps) {
  return (
    <span
      role="img"
      aria-label={label}
      data-icon={icon}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-border bg-surface-raised text-muted",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3/5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={GLYPHS[icon] ?? GENERIC} />
      </svg>
    </span>
  );
}
