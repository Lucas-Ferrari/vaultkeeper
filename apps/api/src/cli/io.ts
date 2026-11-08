/** Process exit codes of the operator CLIs (design 08b: 0 success/unchanged, 1 anything else). */
export const EXIT = {
  OK: 0,
  FAILURE: 1,
} as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Where a CLI talks to the operator. Injected so tests can assert on stdout vs stderr. */
export interface CliIo {
  /** Results (stdout). The only place a generated secret may ever be printed. */
  out(line: string): void;
  /** Errors, usage and progress notes (stderr). */
  err(line: string): void;
}

export const processIo: CliIo = {
  out: (line) => {
    process.stdout.write(`${line}\n`);
  },
  err: (line) => {
    process.stderr.write(`${line}\n`);
  },
};
