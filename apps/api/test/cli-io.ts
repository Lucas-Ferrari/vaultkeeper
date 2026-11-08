import type { CliIo } from "../src/cli/io";

/** CliIo that records lines instead of printing them (CLI tests assert on what was said where). */
export interface MemoryIo extends CliIo {
  readonly stdout: string[];
  readonly stderr: string[];
  /** stdout + stderr, for "never printed anywhere" assertions. */
  all(): string;
}

export function memoryIo(): MemoryIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (line) => {
      stdout.push(line);
    },
    err: (line) => {
      stderr.push(line);
    },
    all: () => [...stdout, ...stderr].join("\n"),
  };
}
