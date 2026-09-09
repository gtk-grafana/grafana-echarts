import { globSync } from 'node:fs';
import path from 'node:path';
import { parseTests } from 'test/testSource';

/**
 * **A canvas test is a snapshot test.**
 *
 * Every test in a `*.canvas.test.*` file must contain a `toMatchCanvasSnapshot`
 * assertion, and that must be its purpose. Everything else belongs in an
 * `*.integration.test.*` sibling.
 *
 * The two kinds have opposite economics. A canvas test commits ~2,500 lines of recorded
 * draw calls that are reviewed as an image, must be regenerated deliberately, and are
 * covered by the "don't update the canvas snapshots" rule in AGENTS.md. An integration
 * test commits nothing and is reviewed as code. Mixed in one file they are
 * indistinguishable, which is how `relations.canvas.test.tsx` accreted 16 of the second
 * kind — a third of the file — without anyone deciding to.
 *
 * This is the rule made mechanical, so the next one cannot be added by accident.
 */
describe('suite shape', () => {
  const files = globSync('src/**/*.canvas.test.*')
    .filter((file) => !file.includes('__snapshots__'))
    .sort();

  it('finds the canvas suites to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s asserts a canvas snapshot in every test', (file) => {
    const offenders = parseTests(file)
      .filter((test) => !test.snapshot)
      .map((test) => `${path.basename(file)}:${test.line} ${test.name}`);

    expect(offenders).toEqual([]);
  });
});
