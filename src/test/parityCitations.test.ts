import { existsSync, readFileSync } from 'node:fs';
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

interface ParityDocPolicy {
  doc: string;
  minimumCitations: number;
  minimumTestTargets: number;
  minimumDashboardCitations: number;
  minimumDashboardSources: number;
}

/**
 * Minimum counts protect broad evidence coverage while permitting new citations.
 * The relations counts preserve the option evidence that existed before the documentation rewrite.
 */
const PARITY_DOCS: ParityDocPolicy[] = [
  {
    doc: 'src/modules/relations/parity.md',
    minimumCitations: 34,
    minimumTestTargets: 34,
    minimumDashboardCitations: 15,
    minimumDashboardSources: 11,
  },
  {
    doc: 'src/modules/part-to-whole/parity.md',
    minimumCitations: 1,
    minimumTestTargets: 1,
    minimumDashboardCitations: 0,
    minimumDashboardSources: 0,
  },
];

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

/** Reference names used by inline Markdown links. */
const referencesIn = (markdown: string): string[] =>
  [...markdown.matchAll(/\[[^\]]+\]\[([^\]]+)\]/g)].map(([, ref]) => ref);

/** References to committed provisioned dashboards. */
const dashboardReferencesIn = (markdown: string): string[] =>
  [...markdown.matchAll(/\[[^\]]+\]\[(db-[^\]]+)\]/g)].map(([, ref]) => ref);

describe.each(PARITY_DOCS)('$doc citations', (policy) => {
  const { doc } = policy;
  const markdown = readFileSync(doc, 'utf8');
  const targets = linkTargets(markdown);
  const citations = citationsIn(markdown);
  const references = referencesIn(markdown);
  const dashboardReferences = dashboardReferencesIn(markdown);

  it('keeps the reviewed evidence coverage', () => {
    const testReferences = new Set(
      references.flatMap((ref) => {
        const target = targets.get(ref);
        return target != null && /\.test\.[jt]sx?$/.test(target) ? [ref] : [];
      })
    );

    expect(citations.length).toBeGreaterThanOrEqual(policy.minimumCitations);
    expect(testReferences.size).toBeGreaterThanOrEqual(policy.minimumTestTargets);
    expect(dashboardReferences.length).toBeGreaterThanOrEqual(policy.minimumDashboardCitations);
    expect(new Set(dashboardReferences).size).toBeGreaterThanOrEqual(policy.minimumDashboardSources);
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

  it('resolves every dashboard citation to a provisioned file', () => {
    const unresolved = dashboardReferences
      .filter((ref) => {
        const target = targets.get(ref);
        return (
          target === undefined ||
          !target.includes('provisioning/dashboards/') ||
          !existsSync(path.join(path.dirname(doc), target))
        );
      })
      .map((ref) => ref);

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
