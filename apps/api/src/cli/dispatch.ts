import { EXIT, type CliIo, type ExitCode } from "./io";

export interface CliCommand {
  /** One-line synopsis, e.g. "promote-admin <email>". */
  usage: string;
  summary: string;
  run(args: readonly string[]): Promise<ExitCode>;
}

export type CommandTable = Readonly<Record<string, CliCommand>>;

const HELP = new Set(["help", "--help", "-h"]);

function usageText(commands: CommandTable): string {
  const lines = Object.values(commands).map(
    (command) => `  ${command.usage}\n      ${command.summary}`,
  );
  return ["Usage: cli <command> [args]", "", "Commands:", ...lines].join("\n");
}

/** `cli <command> [args]`: routes to one operator command (design 08b). */
export async function dispatch(
  argv: readonly string[],
  commands: CommandTable,
  io: CliIo,
): Promise<ExitCode> {
  const [name, ...args] = argv;
  if (name !== undefined && HELP.has(name)) {
    io.out(usageText(commands));
    return EXIT.OK;
  }
  const command = name !== undefined && Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (command === undefined) {
    if (name !== undefined) io.err(`Unknown command: ${name}\n`);
    io.err(usageText(commands));
    return EXIT.FAILURE;
  }
  return command.run(args);
}
