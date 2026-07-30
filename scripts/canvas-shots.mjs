#!/usr/bin/env node
/**
 * Render `*.canvas.test.*` snapshot payloads to PNG, so a canvas change can be reviewed
 * as an image (and shown to the user) instead of read as draw-call JSON.
 *
 * The payloads are written by `toMatchCanvasSnapshot` into `.jest-canvas-mock-compare/`
 * (add `GEN_CANVAS_OUTPUT_ON_PASS=1` to also emit them for passing tests). This script
 * drives the already-running `jest-canvas-mock-compare` viewer — which owns the replay
 * logic — and screenshots the canvases it paints:
 *
 *   npx jest-canvas-mock-compare            # start the viewer (http://localhost:5173)
 *   node scripts/canvas-shots.mjs           # every payload -> one PNG each
 *   node scripts/canvas-shots.mjs --failing # only the ones whose snapshot changed
 *   node scripts/canvas-shots.mjs <basename.json> ...
 *
 * A changed snapshot renders three panels side by side (Expected | Actual | Diff), so a
 * single PNG is the before/after. An unchanged one renders Actual only.
 *
 * Flags: --root <payload dir> --out <dir> --viewer <url> --scale <n> --failing --no-context
 * Run it from a checkout with `node_modules` installed (Playwright + its Chromium:
 * `npx playwright install chromium`). `--root` may point at any absolute payload
 * directory, so one viewer instance can serve payloads from several worktrees.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Resolved from the working directory rather than this file, so a git worktree without
// its own `node_modules` still works when run from a checkout that has them.
const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('@playwright/test');

const PAYLOAD_DIR = '.jest-canvas-mock-compare';
/** Dynamic payload route served by the viewer; `&list=1&meta=1` enumerates with status. */
const PAYLOAD_API = '/__jest-canvas-payload__';

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--root', '--out', '--viewer', '--scale']);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};

const viewer = flag('viewer', 'http://localhost:5173').replace(/\/$/, '');
const root = path.resolve(flag('root', path.join(process.cwd(), PAYLOAD_DIR)));
const out = path.resolve(flag('out', path.join(root, 'shots')));
const scale = Number(flag('scale', 2));
const failingOnly = argv.includes('--failing');
const hideContext = argv.includes('--no-context');
const requested = argv.filter((arg, i) => !arg.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));

const listUrl = `${viewer}${PAYLOAD_API}?payloadRoot=${encodeURIComponent(root)}&list=1&meta=1`;
const index = await fetch(listUrl)
  .then((res) => res.json())
  .catch(() => {
    throw new Error(`No viewer at ${viewer} — start it with \`npx jest-canvas-mock-compare\`.`);
  });

const passed = (file) => index.meta?.[file]?.snapshotAssertionPassed !== false;
const files = (requested.length ? requested : (index.files ?? [])).filter((f) => !failingOnly || !passed(f));

if (!files.length) {
  console.log(`No${failingOnly ? ' changed' : ''} payloads in ${root}`);
  process.exit(0);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: scale });
const page = await context.newPage();

for (const file of files) {
  await page.goto(`${viewer}/?payloadRoot=${encodeURIComponent(root)}&file=${encodeURIComponent(file)}`, {
    waitUntil: 'networkidle',
  });

  // Wait for pixels, not just for the element: the replay runs in an effect after mount.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('canvas.canvas')].some((canvas) => {
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels?.some((value, i) => i % 4 === 3 && value > 0);
      }),
    null,
    { timeout: 15_000 }
  );

  if (hideContext) {
    // Drops the setup layer (axis labels, background) that the matcher does not assert on.
    for (const toggle of await page.getByRole('button', { name: /Hide canvas context/i }).all()) {
      await toggle.click();
    }
  }

  // Clip to the panels: their flex container spans the viewport, so screenshotting it
  // would spend most of the image on empty space.
  const clip = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.plot-panel, .diff-panel-wrap')].map((el) =>
      el.getBoundingClientRect()
    );
    if (!boxes.length) {
      return null;
    }
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    return {
      x: Math.max(0, left - 4),
      y: Math.max(0, top - 4),
      width: Math.max(...boxes.map((b) => b.right)) - left + 8,
      height: Math.max(...boxes.map((b) => b.bottom)) - top + 8,
    };
  });

  const png = clip ? await page.screenshot({ clip }) : await page.locator('.wrap').screenshot();
  const target = path.join(out, `${file.replace(/^jest-canvas-compare-/, '').replace(/\.json$/, '')}.png`);
  writeFileSync(target, png);
  console.log(`${passed(file) ? 'unchanged' : 'CHANGED  '}  ${target}`);
}

await browser.close();
