import { readFileSync } from 'node:fs';

/**
 * A tiny reader for jest test files, used by the two suites that enforce the *shape* of
 * this repo's tests rather than the behaviour of the panel:
 *
 * - `suiteShape.test.ts` — every test in a `*.canvas.test.*` file must be a snapshot
 *   test, so the two kinds of coverage stay in files a reviewer can tell apart.
 * - `parityCitations.test.ts` — every `[canvas: …]` / `[integration: …]` citation in a
 *   `parity.md` must name a test that exists.
 *
 * Parsing the source is the only way in: the names a citation has to match are the ones
 * jest composes from the `describe` nesting, and there is no jest API that reports them
 * without running every suite. Comments are blanked first because `it (` appears in
 * prose, and `it.each(table)(name, cb)` needs the *second* argument list.
 */

export interface ParsedTest {
  /** The full name jest reports: every enclosing `describe` plus the test's own name. */
  fullName: string;
  /** The test's own name, without the describe path. */
  name: string;
  /** True when the body calls `toMatchCanvasSnapshot`. */
  snapshot: boolean;
  /** 1-based line the `it`/`test` call starts on. */
  line: number;
}

/** Blank out comments, preserving offsets so reported lines stay right. */
const blankComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));

/** Index of the bracket closing the one at `open`, skipping string and template bodies. */
const matchBracket = (source: string, open: number): number => {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    } else if (char === '"' || char === "'" || char === '`') {
      i = skipString(source, i);
    }
  }
  return source.length - 1;
};

/** Index of the closing quote of the string starting at `open`. */
const skipString = (source: string, open: number): number => {
  const quote = source[open];
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
    } else if (source[i] === quote) {
      return i;
    }
  }
  return source.length - 1;
};

const LEADING_STRING = /^\(\s*(?:`([^`]*)`|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/;

/** The first argument of a `describe`/`it` call, when it is a plain string literal. */
const nameOf = (argumentList: string): string | undefined => {
  const match = LEADING_STRING.exec(argumentList);
  if (!match) {
    return undefined;
  }
  return (match[1] ?? match[2] ?? match[3]).replace(/\\(['"`])/g, '$1');
};

/**
 * Every `it`/`test` in `path`, with the full name jest would report for it.
 *
 * `describe` scopes are tracked by the offset of their closing brace rather than by
 * indentation, so a nested arrow function or an object literal inside a block cannot
 * shift the path.
 */
export function parseTests(path: string): ParsedTest[] {
  const source = blankComments(readFileSync(path, 'utf8'));
  const tests: ParsedTest[] = [];
  const open: Array<{ name: string; end: number }> = [];
  const call = /\b(describe|it|test)(\.each\s*)?(\.(?:only|skip|todo|concurrent|failing))?\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) {
    let start = match.index + match[0].length - 1;
    if (match[2] !== undefined) {
      // `it.each(table)(name, cb)`: step over the table and take the next argument list.
      const next = source.indexOf('(', matchBracket(source, start) + 1);
      if (next === -1) {
        continue;
      }
      start = next;
    }
    const end = matchBracket(source, start);
    const name = nameOf(source.slice(start, end + 1));
    if (name === undefined) {
      continue;
    }

    while (open.length > 0 && open[open.length - 1].end < match.index) {
      open.pop();
    }

    if (match[1] === 'describe') {
      open.push({ name, end });
      continue;
    }
    tests.push({
      fullName: [...open.map((scope) => scope.name), name].join(' '),
      name,
      snapshot: source.slice(start, end + 1).includes('toMatchCanvasSnapshot'),
      line: source.slice(0, match.index).split('\n').length,
    });
    call.lastIndex = end;
  }
  return tests;
}
