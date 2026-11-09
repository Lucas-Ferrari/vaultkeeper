import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResourceNames } from "./resx";

/**
 * Text-only parser for OpenMU's C# item initializers (design 10 step 2). It never compiles or runs
 * anything: it reads two shapes of item definition and logs everything else it cannot resolve.
 *  1. Factory calls `this.CreateX(...)` whose group/number/name argument positions are listed in
 *     FACTORY_METHODS (they differ per method; overloads are told apart by argument count), plus a
 *     later `x.Group = N;` / `x.Number = N;` on the variable the call was assigned to.
 *  2. Inline blocks `x = Context.CreateNew<ItemDefinition>()` followed by literal
 *     `x.Group/Number/Name = ...;` assignments in the same method.
 * Code inside a factory method itself is skipped (its values are its parameters).
 */

export interface ParsedItem {
  group: number;
  number: number;
  name: string;
  /** Season 6 file the item belongs to (decides the category). */
  file: string;
  /** File actually read: `file`, or an inherited base-version file relative to the S6 folder. */
  source: string;
  line: number;
}

export interface UnparsedDefinition {
  file: string;
  source: string;
  line: number;
  method: string;
  reason: string;
}

export interface ParseResult {
  items: ParsedItem[];
  unparsed: UnparsedDefinition[];
}

/** Where a factory takes a value from. */
type ValueRef =
  | { arg: number }
  | { fixed: number }
  /** Armor factories: group = slot + 5 (ArmorInitializerBase.CreateArmor). */
  | { slotArg: number }
  /** A named constant of the file (e.g. CraftingTalismans `Group`). */
  | { constant: string };

interface FactorySpec {
  /** Only for calls with exactly this many arguments (overloads). */
  args?: number;
  group: ValueRef;
  number: ValueRef;
  name: number;
}

/**
 * Argument positions per OpenMU factory, verified against the method signatures at the pinned
 * commit (Weapons.cs, Items/ArmorInitializerBase.cs, Wings.cs, Jewelery.cs and base versions...).
 */
export const FACTORY_METHODS: Readonly<Record<string, readonly FactorySpec[]>> = {
  CreateWeapon: [{ group: { arg: 0 }, number: { arg: 1 }, name: 7 }],
  CreateShield: [{ group: { slotArg: 1 }, number: { arg: 0 }, name: 5 }],
  CreateArmor: [{ group: { slotArg: 1 }, number: { arg: 0 }, name: 4 }],
  CreateGloves: [{ group: { fixed: 10 }, number: { arg: 0 }, name: 1 }],
  CreateBoots: [
    { args: 14, group: { fixed: 11 }, number: { arg: 0 }, name: 4 },
    { group: { fixed: 11 }, number: { arg: 0 }, name: 1 },
  ],
  CreateLuckyArmor: [{ group: { arg: 1 }, number: { arg: 0 }, name: 4 }],
  CreateWing: [{ group: { fixed: 12 }, number: { arg: 0 }, name: 3 }],
  CreateSmallWing: [{ group: { fixed: 12 }, number: { arg: 0 }, name: 3 }],
  CreateOrb: [{ group: { fixed: 12 }, number: { arg: 0 }, name: 3 }],
  CreateSeed: [{ group: { fixed: 12 }, number: { arg: 0 }, name: 1 }],
  CreateSphere: [{ group: { fixed: 12 }, number: { arg: 0 }, name: 1 }],
  CreateSeedSphere: [{ group: { fixed: 12 }, number: { arg: 0 }, name: 1 }],
  CreatePet: [{ group: { fixed: 13 }, number: { arg: 0 }, name: 4 }],
  CreateRing: [{ group: { fixed: 13 }, number: { arg: 0 }, name: 1 }],
  CreatePendant: [{ group: { fixed: 13 }, number: { arg: 0 }, name: 1 }],
  CreateJewelery: [{ group: { fixed: 13 }, number: { arg: 0 }, name: 3 }],
  CreateTransformationRing: [{ group: { fixed: 13 }, number: { arg: 0 }, name: 1 }],
  CreateElitePotion: [{ group: { fixed: 14 }, number: { arg: 0 }, name: 1 }],
  CreateQuestItem: [{ group: { fixed: 14 }, number: { arg: 0 }, name: 1 }],
  CreateScroll: [{ group: { fixed: 15 }, number: { arg: 0 }, name: 2 }],
  CreateBox: [{ group: { arg: 1 }, number: { arg: 2 }, name: 0 }],
  CreateItem: [
    // CashShopItems.CreateItem(group, number, name)
    { args: 3, group: { arg: 0 }, number: { arg: 1 }, name: 2 },
    // BuffItems.CreateItem(group, number, width, height, name, ...)
    { group: { arg: 0 }, number: { arg: 1 }, name: 4 },
  ],
  CreateEventItem: [{ group: { arg: 1 }, number: { arg: 0 }, name: 4 }],
  CreateSimpleItem: [{ group: { arg: 0 }, number: { arg: 1 }, name: 2 }],
  GetOrCreateItem: [{ group: { constant: "Group" }, number: { arg: 0 }, name: 1 }],
};

/** Not item definitions (rules, option tables, set bonuses): never read (design 10). */
export function isSkippedFile(file: string): boolean {
  return file === "ItemRules.cs" || file === "AncientSets.cs" || file.endsWith("Options.cs");
}

/**
 * Season 6 initializers that call `base.Initialize()` / `base.CreateItems()` of an older version
 * (verified at the pinned commit), so those base files define Season 6 items too. Paths are
 * relative to VersionSeasonSix/Items.
 */
export const SEASON_SIX_INHERITED_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "Jewels.cs": [
    "../../Version097d/Items/Jewels.cs",
    "../../Version095d/Items/Jewels.cs",
    "../../Version075/Items/Jewels.cs",
  ],
  // Version095d.Jewelery.CreateItems does not call its own base, so Version075's are excluded.
  "Jewelery.cs": ["../../Version095d/Items/Jewelery.cs"],
};

// ---------------------------------------------------------------------------------------------
// Lexical helpers (string/char/comment aware)

/** Index just past the string or char literal starting at `start`, or -1 if none starts there. */
function literalEnd(code: string, start: number): number {
  const char = code[start];
  let index = start;
  let verbatim = false;
  if (char === "@" && code[start + 1] === '"') {
    verbatim = true;
    index += 1;
  } else if (char === "$" && code[start + 1] === '"') {
    index += 1;
  } else if (
    (char === "$" || char === "@") &&
    (code[start + 1] === "@" || code[start + 1] === "$") &&
    code[start + 2] === '"'
  ) {
    verbatim = true;
    index += 2;
  } else if (char !== '"' && char !== "'") {
    return -1;
  }
  const quote = code[index];
  index += 1;
  while (index < code.length) {
    const current = code[index];
    if (verbatim) {
      if (current === '"') {
        if (code[index + 1] === '"') index += 2;
        else return index + 1;
        continue;
      }
    } else if (current === "\\") {
      index += 2;
      continue;
    } else if (current === quote) {
      return index + 1;
    } else if (current === "\n") {
      return index; // unterminated: stop at the line end
    }
    index += 1;
  }
  return index;
}

/** Removes // and /* *\/ comments; block comments keep their newlines so line numbers hold. */
export function stripComments(code: string): string {
  let out = "";
  let index = 0;
  while (index < code.length) {
    const end = literalEnd(code, index);
    if (end !== -1) {
      out += code.slice(index, end);
      index = end;
      continue;
    }
    if (code.startsWith("//", index)) {
      const newline = code.indexOf("\n", index);
      index = newline === -1 ? code.length : newline;
      continue;
    }
    if (code.startsWith("/*", index)) {
      const close = code.indexOf("*/", index + 2);
      const stop = close === -1 ? code.length : close + 2;
      out += code.slice(index, stop).replace(/[^\n]/g, "");
      index = stop;
      continue;
    }
    out += code[index];
    index += 1;
  }
  return out;
}

const OPENERS: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);

/** Index of the bracket closing the one at `open` (string aware), or -1. */
function matchingClose(code: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < code.length) {
    const end = literalEnd(code, index);
    if (end !== -1) {
      index = end;
      continue;
    }
    const char = code[index] ?? "";
    if (OPENERS[char]) depth += 1;
    else if (CLOSERS.has(char)) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

/** Splits an argument list at top-level commas, trimming each argument. */
export function splitArguments(list: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let index = 0;
  while (index < list.length) {
    const end = literalEnd(list, index);
    if (end !== -1) {
      current += list.slice(index, end);
      index = end;
      continue;
    }
    const char = list[index] ?? "";
    if (OPENERS[char]) depth += 1;
    else if (CLOSERS.has(char)) depth -= 1;
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
    index += 1;
  }
  if (current.trim() !== "" || args.length > 0) args.push(current.trim());
  return args;
}

function lineAt(code: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) if (code[position] === "\n") line += 1;
  return line;
}

// ---------------------------------------------------------------------------------------------
// Methods and constants

interface MethodSpan {
  name: string;
  params: Set<string>;
  start: number;
  end: number;
}

const NOT_METHODS = new Set([
  "if",
  "for",
  "foreach",
  "while",
  "switch",
  "catch",
  "using",
  "lock",
  "fixed",
  "nameof",
  "typeof",
  "base",
  "this",
  "new",
  "return",
]);

/** `name(params)` of a declaration header ending in `)` (constructor initializers stripped). */
function methodHeader(header: string): { name: string; params: string } | null {
  let text = header.trimEnd();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!text.endsWith(")")) return null;
    const close = text.length - 1;
    let depth = 0;
    let open = -1;
    for (let index = close; index >= 0; index -= 1) {
      if (text[index] === ")") depth += 1;
      else if (text[index] === "(") {
        depth -= 1;
        if (depth === 0) {
          open = index;
          break;
        }
      }
    }
    if (open === -1) return null;
    const before = text.slice(0, open);
    const initializer = before.match(/:\s*(?:base|this)\s*$/);
    if (initializer) {
      text = before.slice(0, initializer.index).trimEnd();
      continue;
    }
    const nameMatch = before.match(/(\w+)\s*$/);
    const name = nameMatch?.[1];
    if (!name || NOT_METHODS.has(name)) return null;
    const preceding = before.slice(0, nameMatch.index).trimEnd();
    // A declaration has something before its name (modifiers / return type); a call or `new X(...)`
    // object initializer does not, or ends in an operator.
    if (preceding === "" || /(?:\bnew|[=.(,:&|!+\-*/<])$/.test(preceding)) return null;
    return { name, params: text.slice(open + 1, close) };
  }
  return null;
}

function parameterNames(params: string): Set<string> {
  const names = new Set<string>();
  for (const param of splitArguments(params)) {
    const withoutDefault = param.split("=")[0] ?? "";
    const name = withoutDefault.trim().match(/@?(\w+)\s*$/)?.[1];
    if (name) names.add(name);
  }
  return names;
}

/** Every method-like body (methods, constructors, local functions) with its parameter names. */
function methodSpans(code: string): MethodSpan[] {
  const spans: MethodSpan[] = [];
  let boundary = 0;
  let index = 0;
  while (index < code.length) {
    const end = literalEnd(code, index);
    if (end !== -1) {
      index = end;
      continue;
    }
    const char = code[index];
    if (char === "{") {
      const header = methodHeader(code.slice(boundary, index));
      if (header) {
        const close = matchingClose(code, index);
        spans.push({
          name: header.name,
          params: parameterNames(header.params),
          start: index,
          end: close === -1 ? code.length : close,
        });
      }
      boundary = index + 1;
    } else if (char === ";" || char === "}") {
      boundary = index + 1;
    }
    index += 1;
  }
  return spans;
}

function enclosingMethod(spans: readonly MethodSpan[], position: number): MethodSpan | undefined {
  let best: MethodSpan | undefined;
  for (const span of spans) {
    if (span.start <= position && position <= span.end && (!best || span.start > best.start)) {
      best = span;
    }
  }
  return best;
}

interface Scope {
  code: string;
  fileConstants: ReadonlyMap<string, string>;
  method: MethodSpan | undefined;
}

const CONSTANT = /\bconst\s+[\w.?]+\s+(\w+)\s*=\s*([^;]+);/g;

function constantsIn(code: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of code.matchAll(CONSTANT)) {
    const [, name, value] = match;
    if (name && value) constants.set(name, value.trim());
  }
  return constants;
}

/** Integer value of a literal, cast literal or constant; undefined if not statically known. */
function resolveInt(expression: string, scope: Scope, depth = 0): number | undefined {
  const text = expression
    .trim()
    .replace(/^\((?:byte|sbyte|short|ushort|int|uint|long)\)\s*/, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^\w+$/.test(text) && depth < 5) {
    const local = scope.method
      ? constantsIn(scope.code.slice(scope.method.start, scope.method.end)).get(text)
      : undefined;
    const value = local ?? scope.fileConstants.get(text);
    if (value !== undefined) return resolveInt(value, scope, depth + 1);
  }
  return undefined;
}

function unescapeCs(body: string, verbatim: boolean): string {
  if (verbatim) return body.replace(/""/g, '"');
  return body
    .replace(/\\(["'\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

type NameResult = { name: string } | { error: string };

function resolveName(expression: string, names: ResourceNames): NameResult {
  const resource = expression.match(/\bItemNames\.(\w+)\b/);
  if (resource?.[1]) {
    const name = names.get(resource[1]);
    return name ? { name } : { error: `unknown resource key ItemNames.${resource[1]}` };
  }
  const literal = expression
    .trim()
    .match(/^(?:new\s+LocalizedString\s*\(\s*)?(@?)"((?:[^"\\]|\\.|"")*)"\s*\)?$/);
  if (literal) {
    const name = unescapeCs(literal[2] ?? "", literal[1] === "@")
      .replace(/\s+/g, " ")
      .trim();
    return name ? { name } : { error: "empty name literal" };
  }
  return { error: `name is neither an ItemNames resource nor a literal: ${expression.trim()}` };
}

function assignment(body: string, variable: string, property: string): string | undefined {
  const pattern = new RegExp(`(?:^|[^\\w.])${variable}\\.${property}\\s*=\\s*([^;]+);`);
  return body.match(pattern)?.[1];
}

// ---------------------------------------------------------------------------------------------
// Extraction

function resolveRef(ref: ValueRef, args: readonly string[], scope: Scope): number | undefined {
  if ("fixed" in ref) return ref.fixed;
  if ("constant" in ref) return resolveInt(ref.constant, scope);
  const value = resolveInt(args["arg" in ref ? ref.arg : ref.slotArg] ?? "", scope);
  if (value === undefined) return undefined;
  return "slotArg" in ref ? value + 5 : value;
}

const FACTORY_CALL = /\bthis\.(\w+)\s*\(/g;
const INLINE_DEFINITION =
  /(?:^|[^\w.])(\w+)\s*=\s*(?:this\.)?[Cc]ontext\.CreateNew<ItemDefinition>\(\s*\)/g;

/** Parses one .cs file. `file` decides the category; `source` is what is reported in logs. */
export function parseItemsFile(
  file: string,
  rawCode: string,
  names: ResourceNames,
  source: string = file,
): ParseResult {
  const code = stripComments(rawCode);
  const spans = methodSpans(code);
  const fileConstants = constantsIn(code);
  const found: { position: number; item?: ParsedItem; unparsed?: UnparsedDefinition }[] = [];

  const fail = (position: number, method: MethodSpan | undefined, reason: string) => {
    found.push({
      position,
      unparsed: { file, source, line: lineAt(code, position), method: method?.name ?? "?", reason },
    });
  };
  const add = (position: number, group: number, number: number, name: string) => {
    found.push({
      position,
      item: { group, number, name, file, source, line: lineAt(code, position) },
    });
  };

  for (const match of code.matchAll(FACTORY_CALL)) {
    const method = match[1] ?? "";
    const specs = FACTORY_METHODS[method];
    if (!specs) continue;
    const position = match.index;
    const scope: Scope = { code, fileConstants, method: enclosingMethod(spans, position) };
    if (scope.method && FACTORY_METHODS[scope.method.name]) continue; // forwarding inside a factory

    const open = position + match[0].length - 1;
    const close = matchingClose(code, open);
    if (close === -1) {
      fail(position, scope.method, `unbalanced call to ${method}`);
      continue;
    }
    const args = splitArguments(code.slice(open + 1, close));
    const spec = specs.find(
      (candidate) => candidate.args === undefined || candidate.args === args.length,
    );
    if (!spec) {
      fail(position, scope.method, `no argument table for ${method} with ${args.length} arguments`);
      continue;
    }
    let group = resolveRef(spec.group, args, scope);
    let number = resolveRef(spec.number, args, scope);
    // `var x = this.CreateX(...); ... x.Group = 13;` (e.g. the Cape of Lord is a group 13 wing).
    const assigned = code
      .slice(0, position)
      .match(/(?:var|ItemDefinition\??)\s+(\w+)\s*=\s*$/)?.[1];
    if (assigned && scope.method) {
      const rest = code.slice(close, scope.method.end);
      const groupOverride = assignment(rest, assigned, "Group");
      const numberOverride = assignment(rest, assigned, "Number");
      if (groupOverride !== undefined) group = resolveInt(groupOverride, scope);
      if (numberOverride !== undefined) number = resolveInt(numberOverride, scope);
    }
    const name = resolveName(args[spec.name] ?? "", names);
    if (group === undefined || number === undefined) {
      fail(
        position,
        scope.method,
        `${method}: group/number not statically known (${args.slice(0, 3).join(", ")})`,
      );
    } else if ("error" in name) {
      fail(position, scope.method, `${method}: ${name.error}`);
    } else {
      add(position, group, number, name.name);
    }
  }

  for (const match of code.matchAll(INLINE_DEFINITION)) {
    const variable = match[1] ?? "";
    const position = match.index + match[0].indexOf(variable);
    const method = enclosingMethod(spans, position);
    if (method && FACTORY_METHODS[method.name]) continue;
    const scope: Scope = { code, fileConstants, method };
    const body = code.slice(position, method?.end ?? code.length);
    const values = {
      Group: assignment(body, variable, "Group"),
      Number: assignment(body, variable, "Number"),
      Name: assignment(body, variable, "Name"),
    };
    const group = values.Group === undefined ? undefined : resolveInt(values.Group, scope);
    const number = values.Number === undefined ? undefined : resolveInt(values.Number, scope);
    const unresolved = (["Group", "Number"] as const).filter(
      (property) => (property === "Group" ? group : number) === undefined,
    );
    if (unresolved.length > 0) {
      const detail = unresolved.map(
        (property) => `${property} = ${values[property]?.trim() ?? "?"}`,
      );
      fail(position, method, `inline definition with non-literal ${detail.join(", ")}`);
      continue;
    }
    const name = resolveName(values.Name ?? "", names);
    if ("error" in name) fail(position, method, `inline definition: ${name.error}`);
    else if (group !== undefined && number !== undefined) add(position, group, number, name.name);
  }

  found.sort((a, b) => a.position - b.position);
  return {
    items: found.flatMap((entry) => (entry.item ? [entry.item] : [])),
    unparsed: found.flatMap((entry) => (entry.unparsed ? [entry.unparsed] : [])),
  };
}

export interface ParseDirectoryOptions {
  /** Season 6 file -> base-version files (relative to `directory`) it inherits items from. */
  inherited?: Readonly<Record<string, readonly string[]>>;
}

/** Parses every item .cs file of a folder (sorted by file name, skipped files excluded). */
export async function parseItemsDirectory(
  directory: string,
  names: ResourceNames,
  options: ParseDirectoryOptions = {},
): Promise<ParseResult> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".cs") && !isSkippedFile(file))
    .sort();
  const result: ParseResult = { items: [], unparsed: [] };
  for (const file of files) {
    for (const source of [file, ...(options.inherited?.[file] ?? [])]) {
      const code = await readFile(join(directory, source), "utf8");
      const parsed = parseItemsFile(file, code, names, source);
      result.items.push(...parsed.items);
      result.unparsed.push(...parsed.unparsed);
    }
  }
  return result;
}

/** Default limit of unparseable definitions (design 10, risk 4). */
export const MAX_UNPARSED_RATIO = 0.02;

/** Throws, listing every unparsed definition, when more than `maxRatio` of them failed. */
export function assertParseRate(result: ParseResult, maxRatio = MAX_UNPARSED_RATIO): void {
  const total = result.items.length + result.unparsed.length;
  const ratio = total === 0 ? 0 : result.unparsed.length / total;
  if (ratio <= maxRatio) return;
  const list = result.unparsed
    .map((entry) => `  ${entry.source}:${entry.line} (${entry.method}): ${entry.reason}`)
    .join("\n");
  throw new Error(
    `${result.unparsed.length} of ${total} item definitions (${(ratio * 100).toFixed(1)}%) could ` +
      `not be parsed; the limit is ${(maxRatio * 100).toFixed(1)}%:\n${list}`,
  );
}
