#!/usr/bin/env node
// Canvas baseline inventory: one line per committed snapshot, `<sha256 of body>  <key>`.
//
// The snapshot refactor (todo/relations-test-refactor.md) moves, reformats and re-records
// 167 baselines totalling a quarter of a million lines. A raw `git diff` cannot answer the
// only question each phase needs answered — "which baselines changed *content*, and which
// merely moved?" — so hash the body of every block instead and diff the inventories:
//
//   node scripts/canvas-inventory.mjs > /tmp/before.txt   # on the base commit
//   node scripts/canvas-inventory.mjs > /tmp/after.txt
//   diff /tmp/before.txt /tmp/after.txt
//
// A rename-only phase must produce a byte-identical inventory. A reformat phase must
// produce a *complete* one — the same keys, every hash different — which is the proof
// that nothing was dropped while everything was rewritten.
//
// Sorted by key so the output is stable regardless of file layout or glob order.
import { createHash } from 'node:crypto';
import { globSync, readFileSync } from 'node:fs';

const SNAPSHOT_GLOB = 'src/**/__snapshots__/*.snap';

// `exports[`<key>`] = `<body>`;` — jest escapes a literal backtick in either half as
// `\``, so split on the unescaped delimiters only.
const BLOCK = /^exports\[`((?:[^`\\]|\\.)*)`\] = `((?:[^`\\]|\\.)*)`;$/gms;

/** `key → sha256(body)` for every baseline in `file`. */
const inventory = (file) =>
  [...readFileSync(file, 'utf8').matchAll(BLOCK)].map(([, key, body]) => ({
    key,
    hash: createHash('sha256').update(body).digest('hex'),
  }));

const entries = globSync(SNAPSHOT_GLOB)
  .sort()
  .flatMap(inventory)
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

for (const { hash, key } of entries) {
  console.log(`${hash}  ${key}`);
}

// Totals on stderr, so `>` captures only the inventory itself.
process.stderr.write(`${entries.length} baselines\n`);
