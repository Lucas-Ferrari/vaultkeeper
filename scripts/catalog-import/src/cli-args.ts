import { resolve } from "node:path";
import { parseArgs } from "node:util";

export const USAGE =
  "Usage: pnpm catalog:generate --openmu <OpenMU clone> [--out <seed.json>] [--commit <sha>]";

/** apps/api/seed/catalog.openmu-s6.json (committed; the seeder reads it). */
export const DEFAULT_OUT = resolve(
  import.meta.dirname,
  "../../../apps/api/seed/catalog.openmu-s6.json",
);

export interface CliArgs {
  /** Root of an OpenMU clone (read as text only). */
  openmu: string;
  out: string;
  /** Commit SHA, only needed when the clone has no .git folder. */
  commit: string | undefined;
}

/** Parses the generator flags; relative paths resolve against `cwd` (the caller's directory). */
export function parseCliArgs(argv: readonly string[], cwd: string): CliArgs {
  let values: {
    openmu?: string | undefined;
    out?: string | undefined;
    commit?: string | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        openmu: { type: "string" },
        out: { type: "string" },
        commit: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (cause) {
    throw new Error(USAGE, { cause });
  }
  if (!values.openmu) throw new Error(USAGE);
  if (values.commit !== undefined && !/^[0-9a-f]{40}$/.test(values.commit)) {
    throw new Error(`${USAGE}\n--commit must be a full 40-character SHA`);
  }
  return {
    openmu: resolve(cwd, values.openmu),
    out: values.out ? resolve(cwd, values.out) : DEFAULT_OUT,
    commit: values.commit,
  };
}
