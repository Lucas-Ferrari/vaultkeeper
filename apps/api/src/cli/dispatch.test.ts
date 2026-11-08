import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryIo } from "../../test/cli-io";
import type { Auth } from "../auth/auth";
import type { Database } from "../db/client";
import { createCommands, type CliServices } from "./commands";
import { dispatch, type CommandTable } from "./dispatch";
import { EXIT } from "./io";

// Only run() is replaced; usage strings stay real.
vi.mock(import("./promote-admin"), async (original) => ({
  ...(await original()),
  run: vi.fn(async () => EXIT.OK),
}));
vi.mock(import("./demote-admin"), async (original) => ({
  ...(await original()),
  run: vi.fn(async () => EXIT.OK),
}));
vi.mock(import("./reset-password"), async (original) => ({
  ...(await original()),
  run: vi.fn(async () => EXIT.FAILURE),
}));

const promoteAdmin = await import("./promote-admin");
const demoteAdmin = await import("./demote-admin");
const resetPassword = await import("./reset-password");

function fakeTable() {
  const calls: { name: string; args: readonly string[] }[] = [];
  const command = (name: string, code: 0 | 1) => ({
    usage: `${name} <x>`,
    summary: `does ${name}`,
    run: async (args: readonly string[]) => {
      calls.push({ name, args });
      return code;
    },
  });
  const table: CommandTable = { alpha: command("alpha", 0), beta: command("beta", 1) };
  return { table, calls };
}

describe("dispatch (CLI entry, 2.17)", () => {
  it("unknown command -> says so, prints usage with every command, exit 1, runs nothing", async () => {
    const { table, calls } = fakeTable();
    const io = memoryIo();

    const code = await dispatch(["gamma", "x"], table, io);

    expect(code).toBe(EXIT.FAILURE);
    const stderr = io.stderr.join("\n");
    expect(stderr).toContain("Unknown command: gamma");
    expect(stderr).toMatch(/usage: cli <command>/i);
    expect(stderr).toContain("alpha <x>");
    expect(stderr).toContain("beta <x>");
    expect(calls).toEqual([]);
  });

  it("no command -> usage on stderr, exit 1", async () => {
    const { table, calls } = fakeTable();
    const io = memoryIo();

    expect(await dispatch([], table, io)).toBe(EXIT.FAILURE);
    expect(io.stderr.join("\n")).toMatch(/usage: cli <command>/i);
    expect(calls).toEqual([]);
  });

  it.each([["help"], ["--help"], ["-h"]])("%s -> usage on stdout, exit 0", async (flag) => {
    const { table } = fakeTable();
    const io = memoryIo();

    expect(await dispatch([flag], table, io)).toBe(EXIT.OK);
    expect(io.stdout.join("\n")).toContain("alpha <x>");
  });

  it("routes to the named command with the remaining args and returns its exit code", async () => {
    const { table, calls } = fakeTable();

    expect(await dispatch(["beta", "a@x.com", "--flag"], table, memoryIo())).toBe(1);
    expect(calls).toEqual([{ name: "beta", args: ["a@x.com", "--flag"] }]);
  });

  it("does not treat inherited object keys as commands", async () => {
    const { table } = fakeTable();
    expect(await dispatch(["toString"], table, memoryIo())).toBe(EXIT.FAILURE);
  });
});

describe("createCommands (real command table)", () => {
  const io = memoryIo();
  const readStdin = async () => "";
  const services: CliServices = {
    db: {} as Database,
    auth: {} as Auth,
    close: vi.fn(async () => {}),
  };
  const open = vi.fn(async () => services);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes promote-admin, demote-admin and reset-password", () => {
    expect(Object.keys(createCommands({ open, io, readStdin })).sort()).toEqual([
      "demote-admin",
      "promote-admin",
      "reset-password",
    ]);
  });

  it.each([
    ["promote-admin", promoteAdmin.run, { db: services.db, io }],
    ["demote-admin", demoteAdmin.run, { db: services.db, io }],
    ["reset-password", resetPassword.run, { auth: services.auth, io, readStdin }],
  ] as const)("%s -> that CLI's run(args, deps), then closes the pool", async (name, run, deps) => {
    const commands = createCommands({ open, io, readStdin });

    const code = await commands[name]?.run(["a@x.com"]);

    expect(run).toHaveBeenCalledExactlyOnceWith(["a@x.com"], deps);
    expect(code).toBe(await vi.mocked(run).mock.results[0]?.value);
    expect(open).toHaveBeenCalledOnce();
    expect(services.close).toHaveBeenCalledOnce();
  });

  it("closes the pool even when the command throws", async () => {
    vi.mocked(promoteAdmin.run).mockRejectedValueOnce(new Error("db down"));
    const commands = createCommands({ open, io, readStdin });

    await expect(commands["promote-admin"]?.run(["a@x.com"])).rejects.toThrow("db down");
    expect(services.close).toHaveBeenCalledOnce();
  });
});
