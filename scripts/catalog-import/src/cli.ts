import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseCliArgs } from "./cli-args";
import { SEASON_SIX_INHERITED_SOURCES } from "./cs-parser";
import { generateSeed, readGitCommit, serializeSeed } from "./generate";

/**
 * pnpm catalog:generate --openmu <clone> (design 10). Dev-only, run by hand when bumping the
 * pinned OpenMU commit; review the seed diff before committing it. Never executes OpenMU code:
 * the .cs/.resx files and .git refs are read as text.
 */
async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), process.env["INIT_CWD"] ?? process.cwd());
  const initialization = join(args.openmu, "src", "Persistence", "Initialization");
  const openmuCommit = args.commit ?? (await readGitCommit(args.openmu));

  const result = await generateSeed({
    itemsDirectory: join(initialization, "VersionSeasonSix", "Items"),
    resxPath: join(initialization, "Properties", "ItemNames.resx"),
    openmuCommit,
    inherited: SEASON_SIX_INHERITED_SOURCES,
  });

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, serializeSeed(result.seed));

  const total = result.parsedCount + result.unparsed.length;
  const log = (line: string) => process.stderr.write(`${line}\n`);
  log(
    `OpenMU ${openmuCommit}: ${result.seed.items.length} items in ${result.seed.categories.length} categories`,
  );
  log(
    `definitions: ${result.parsedCount} parsed, ${result.unparsed.length} unparsed ` +
      `(${((result.unparsed.length / total) * 100).toFixed(2)}% of ${total})`,
  );
  for (const entry of result.unparsed) {
    log(`  unparsed ${entry.source}:${entry.line} (${entry.method}): ${entry.reason}`);
  }
  for (const warning of result.warnings) log(`  note ${warning}`);
  const counts = new Map<string, number>();
  for (const item of result.seed.items)
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  log(`per category: ${[...counts].map(([slug, count]) => `${slug} ${count}`).join(", ")}`);
  log(`wrote ${args.out}`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `catalog:generate failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
