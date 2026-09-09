import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTests } from 'test/testSource';

/**
 * Every `[canvas: …]` / `[integration: …]` citation in a module's `parity.md` must name
 * a test that exists, in the file its link points at.
 *
 * The citations used to be paraphrases pointing at one file — "curves links", "sankey
 * variant, chord variant" — which is unenforceable by construction, and several had
 * already drifted off any real test by the time anyone looked. One of them was worse
 * than drifted: the relations table cited a "blends link color in gradient mode" case
 * whose baseline was byte-identical to the base render, so the doc's proof for Gradient
 * mode was a picture with no gradient in it.
 *
 * Citing the exact test name makes the table checkable, and this is the check. It is
 * deliberately strict about the *name* rather than about coverage: a renamed test must
 * be re-cited, because a citation nobody maintains is worth less than none.
 */

/** `parity.md` files that use the citation format; others are ignored. */
const PARITY_DOCS = ['src/modules/relations/parity.md', 'src/modules/part-to-whole/parity.md'];

/** `[canvas: some test name][ref]` / `[integration: some test name][ref]`. */
const CITATION = /\[(canvas|integration):\s*([^\]]+)\]\[([^\]]+)\]/g;

/** A markdown link definition: `[ref]: ../relative/path`. */
const linkTargets = (markdown: string): Map<string, string> => {
  const targets = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const match = /^\[([^\]]+)\]:\s*(\S+)\s*$/.exec(line);
    if (match) {
      targets.set(match[1], match[2]);
    }
  }
  return targets;
};

/** Line breaks inside a table cell or a bullet are not part of the test's name. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

interface Citation {
  kind: string;
  name: string;
  ref: string;
}

const citationsIn = (markdown: string): Citation[] =>
  [...markdown.matchAll(CITATION)].map(([, kind, name, ref]) => ({ kind, name: collapse(name), ref }));

describe.each(PARITY_DOCS)('%s test citations', (doc) => {
  const markdown = readFileSync(doc, 'utf8');
  const targets = linkTargets(markdown);
  const citations = citationsIn(markdown);

  it('cites at least one test', () => {
    expect(citations.length).toBeGreaterThan(0);
  });

  it('resolves every citation to a test file this repo has', () => {
    const unresolved = citations
      .filter(({ ref }) => {
        const target = targets.get(ref);
        return target === undefined || !/\.test\.[jt]sx?$/.test(target);
      })
      .map(({ ref }) => ref);

    expect([...new Set(unresolved)]).toEqual([]);
  });

  it('names a test that exists, in the file the link points at', () => {
    const missing: string[] = [];
    for (const { kind, name, ref } of citations) {
      const target = targets.get(ref);
      if (target === undefined) {
        continue; // reported by the case above
      }
      const file = path.join(path.dirname(doc), target);
      const names = new Set(parseTests(file).flatMap((test) => [test.name, test.fullName]));
      if (!names.has(name)) {
        missing.push(`${kind}: ${name} -> ${path.basename(file)}`);
      }
    }

    expect(missing).toEqual([]);
  });

  /**
   * A `canvas:` citation has to point at a canvas suite and an `integration:` one at an
   * integration suite, so the reader can tell from the table which kind of proof they
   * are being offered — a picture, or a comparison between two renders.
   */
  it('matches each citation kind to the kind of suite it points at', () => {
    const mismatched = citations
      .filter(({ kind, ref }) => {
        const target = targets.get(ref) ?? '';
        return kind === 'canvas' ? !target.includes('.canvas.test.') : !target.includes('.integration.test.');
      })
      .map(({ kind, ref }) => `${kind} -> ${ref}`);

    expect([...new Set(mismatched)]).toEqual([]);
  });
});
