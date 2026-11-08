import { useState } from "react";
import { cn } from "../lib/cn";
import { CategoryIcon } from "./category-icon";

interface ItemImageProps {
  imageKey: string | null;
  /** Item name: the accessible name of the image or placeholder. */
  name: string;
  /** Category icon key for the placeholder. */
  categoryIcon: string;
  className?: string;
}

/**
 * Item picture from /media/<key> (immutable, content-addressed), or the category placeholder
 * when there is none or it fails to load (R-CAT-6 S3). A different key is tried again.
 */
export function ItemImage({ imageKey, name, categoryIcon, className }: ItemImageProps) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const box = cn("size-12 shrink-0", className);

  if (imageKey === null || failedKey === imageKey) {
    return <CategoryIcon icon={categoryIcon} label={name} className={box} />;
  }
  return (
    <img
      src={`/media/${imageKey}`}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailedKey(imageKey)}
      className={cn(box, "rounded-lg border border-border object-contain")}
    />
  );
}
