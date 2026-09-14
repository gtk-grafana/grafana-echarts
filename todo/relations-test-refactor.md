# Relations test refactor: move the suites, shrink the baselines

Execution plan for the two proposals in
[docs/relations-canvas-coverage.md](../docs/relations-canvas-coverage.md) — cut snapshot
size, and move the canvas suites into a per-family directory.

**Status.** Phases 0-3 landed, one commit each. Phase 4 is blocked upstream and its
spike is done — [canvas-snapshot-props-path.md](canvas-snapshot-props-path.md) carries
the evidence. Phase 5 is a set of per-case coverage decisions and is untouched.

| Phase |                             |                                                         |
| ----- | --------------------------- | ------------------------------------------------------- |
| 0     | guardrails                  | landed — `scripts/canvas-inventory.mjs`, `test:ci --ci` |
| 1     | move the suites             | landed — byte-identical inventory                       |
| 2     | compact serializer          | landed — 265,626 lines → 27,924                         |
| 3     | one render pass             | landed — 27,924 → 14,524 (1.06 MB)                      |
| 4     | drop `props.path`           | blocked upstream, spike done (-30% bytes)               |
| 5     | retire one-number baselines | open, per-case                                          |

Where Phase 3's diagnosis differed from the plan below: the second paint is not the
mocked `ResizeObserver` but `useChartResize`, which calls `chart.resize(…)` on mount with
the size ECharts had already measured. `resize` repaints unconditionally, so option B
("size the container explicitly") could not have removed it; the landed fix is option A,
generalised over every capture helper.

**Where it started** (measured 2026-09-12, after the colour suite landed):

|                 |                                                                   |
| --------------- | ----------------------------------------------------------------- |
| Baselines       | 167 across 15 `.snap` files                                       |
| Snapshot lines  | 265,626 (4.0 MB) — **4.6x** the 57k lines of TypeScript in `src/` |
| Relations share | 122,489 lines (46%)                                               |
| Format cost     | 7.0 lines per recorded draw call                                  |
| Duplication     | every baseline records the harness's **two** render passes        |
| Redundancy      | 78,324 lines (29%) sit inside `props.path` arrays                 |

**Rules this plan has to respect**

- `AGENTS.md`: never regenerate canvas baselines as a side effect of other work. Every
  phase below that rewrites baselines is its own commit, reviewed as images.
- `src/test/suiteShape.test.ts`: a `*.canvas.test.*` file contains only
  `toMatchCanvasSnapshot` tests. The phases keep that true.
- Baselines are keyed by `describe`/`it` strings, not by path. **No phase renames a
  test.** Renaming is a separate decision with a separate cost (`parityCitations` +
  re-review).

## Phase 0 — guardrails (no baseline changes)

1. **An inventory tool.** Every later phase needs the same question answered: "which
   baselines changed _content_, and which merely moved?" Add
   `scripts/canvas-inventory.mjs` writing `name → sha256(body)` for every block in every
   `.snap`, so phases can be diffed as sets rather than as 260k-line patches:

   ```js
   // one line per baseline: <sha256 of body>  <snapshot key>
   for (const file of globSync('src/**/__snapshots__/*.snap')) {
     for (const block of readFileSync(file, 'utf8').split('exports[').slice(1)) {
       const [key, body] = [block.split('] = `')[0], block.split('] = `')[1]];
       console.log(createHash('sha256').update(body).digest('hex'), key.trim());
     }
   }
   ```

   Phase 1 must produce a byte-identical inventory. Phases 2-4 must produce a _complete_
   one — same 167 keys, every hash changed — which is the proof that nothing was dropped
   while everything was reformatted.

2. **Stop the pre-commit hook from writing baselines.** `lefthook.yml` runs
   `pnpm run test:ci`, which is `jest --passWithNoTests --maxWorkers 4` — no `--ci`, so
   jest _writes_ any snapshot it finds missing instead of failing. During a refactor that
   turns a mistake (a renamed test, a moved file jest cannot pair with its `.snap`) into a
   silently written baseline plus an obsolete one. Add `--ci` to the `test:ci` script.
   Cheap, permanent, and it makes Phase 1's "content unchanged" claim enforceable.

## Phase 1 — move the suites (rename-only, zero baseline churn)

Target layout, per the shape asked for:

```
src/lib/components/canvas-tests/relations/
  graph.canvas.test.tsx          + __snapshots__/graph.canvas.test.tsx.snap
  sankey.canvas.test.tsx         + …
  chord.canvas.test.tsx
  overrides.canvas.test.tsx
  color.canvas.test.tsx
  timeline.canvas.test.tsx
```

Steps:

1. `git mv` each test **and its `.snap`** in the same commit. Jest resolves
   `__snapshots__` relative to the test file, so the pairing is mechanical; doing the two
   halves in separate commits makes the first one look like 122k deleted lines.
2. Drop the now-redundant `relations-` filename prefix (the directory carries it). This
   changes no `describe` string, so **no snapshot content moves** — verify with Phase 0's
   inventory and with `git diff -M --stat` showing pure renames.
3. Update the pointers, all mechanical:
   - `src/modules/relations/parity.md` lines ~521-530 — the 10 link definitions that
     point at test paths. `src/test/parityCitations.test.ts` resolves each citation
     against the file the link names, so a stale path fails the build. This is the one
     place the move cannot be silent, and the reason it is safe.
   - `docs/relations-canvas-coverage.md` — the "Suites are named …" convention line and
     the directory proposal section.
   - `AGENTS.md` if any path is quoted there.
4. Nothing else needs touching, verified: `suiteShape.test.ts` globs
   `src/**/*.canvas.test.*`; jest resolves through `modulePaths: ['<rootDir>/src']` and
   not one of the 15 canvas suites uses a relative `../` import; `scripts/canvas-shots.mjs`
   and the compare viewer key off `.jest-canvas-mock-compare/`, not the test path.

**Decision needed: do the integration siblings move too?** Six files
(`relations-labels`, `-layout`, `-interaction`, `-derived-nodes`, `-timeline`,
`-values`, each `.integration.test.tsx`) sit beside the components. They commit no baselines, so moving
them is free of snapshot risk, and `parity.md` is already being edited in this commit.
Recommend moving them to `src/lib/components/integration-tests/relations/` in the same
commit — the alternative (canvas suites in a directory, integration siblings not) leaves
the family's coverage split across two conventions, which is the thing the move is meant
to fix. Keep the two directory names distinct: the point of the split is that one kind
commits pictures and the other does not.

Extending the same layout to the other families (`cartesian/`, `part-to-whole/`,
`multivariate/`, `stream/`) is the same operation, one commit each, and can follow
whenever. Relations first because it is 46% of the bulk.

## Phase 2 — a compact snapshot serializer (-86% of lines)

The format, not the content, is the bulk: 7.0 lines per draw call, five of which are
`{`, `"props": {`, `}`, `"type": …`, `},`. One line per event keeps every asserted
number and makes a canvas diff readable as a diff.

**The constraint that fixes the design.** `toMatchCanvasSnapshot` delegates to
`jest-snapshot`'s `toMatchSnapshot`, so a serializer registered with
`expect.addSnapshotSerializer` does reach the stored format. But the matcher then feeds
`result.expected` back through its own `parseSnapshotJson` to build the compare viewer's
payload, and that helper is `JSON.parse` with trailing-comma tolerance. So the serializer
**must emit valid JSON** or the viewer silently loses its "expected" side (it logs
`failed to parse expected snapshot JSON` and returns).

That rules out a prose format (`fillText "Gateway" @ 0,6`) and points at: one JSON object
per line, inside a JSON array.

```
[
{"type":"fillStyle","props":{"value":"#73bf69"}},
{"type":"fillText","props":{"text":"Gateway","x":0,"y":6,"maxWidth":null}}
]
```

- Valid JSON → `parseSnapshotJson` keeps working, viewer unaffected.
- One line per event → a moved label is a one-line diff, not a seven-line block.
- Expect ~38.4k lines (38,027 events + brackets) and roughly 1.6 MB.

Verify: inventory shows all 167 keys with new hashes; `node scripts/canvas-shots.mjs`
renders one payload per family and the PNGs match what is on `main`; one deliberate
pixel change still produces a readable failure diff.

## Phase 3 — assert one render pass, not two (-50% again)

Each baseline records two full paints. For the relations `base` picture the two halves are
identical event-for-event (366 events, first half == second half), so half of every
baseline is duplicate — and where the halves _diverge_ (themeRiver) the baseline pins a
pre-settle layout, which is a live fragility, not just bulk.

Options: (A) wait for the
resize-driven re-render, then clear the recorded events so only the settled pass is
asserted; (B) size the container explicitly so only one pass ever runs; (C) assert only
the last pass by filtering at the `save`/`setTransform` boundary.

Recommend **B, with A as the fallback**: B removes the second pass instead of hiding it,
which also kills the doubled-label artefact in every replayed image (the thing every
reviewer currently has to re-derive). B's risk is that the mocked `ResizeObserver` is what
several suites depend on for a non-zero chart box — so it is a `jest-setup.js` change
with a whole-suite blast radius, and it belongs after Phase 2 so the resulting diff is
readable.

After this phase: ~19k lines, ~0.8 MB. Delete the todo it resolves.

## Phase 4 — drop `props.path` (-29% of bytes) — blocked upstream

Every `stroke`, `fill` and `clip` event embeds the path it draws, a verbatim copy of the
`moveTo` / `lineTo` / `quadraticCurveTo` / `arc` events recorded immediately before it.
For the _assertion_ it is pure duplication.

**It cannot be stripped locally.** The matcher snapshots and payloads the same array:
`received` goes to `toMatchSnapshot(received)` and into `payload.actual`. The compare
viewer draws shapes from `stroke.props.path` — which is exactly why
[the `quadraticCurveTo` gap](../jest-setup.js) mattered: a curve missing from that array
rendered as nothing at all. Stripping it in `normalizeCanvasEvents` would shrink the
baselines and blank every filled or stroked shape in the viewer.

So this phase is an upstream change in `grafana/jest-canvas-mock-compare` — written up
with the spike's evidence in
[canvas-snapshot-props-path.md](canvas-snapshot-props-path.md) — one of:

- strip `props.path` inside the matcher for the snapshot only, keeping it in the payload;
  or
- teach the viewer to replay the flat event stream (it already has every path op in
  order), after which `props.path` can go everywhere.

Either is small and the second is better. Until one lands, leave `props.path` alone and
take the 29%. First step is a spike: render a payload with `path` stripped, open it in the
viewer, confirm the shapes vanish — that is the evidence the issue needs.

## Phase 5 — optional: retire baselines that pin one number

Not a format change, a coverage decision, per case:

- `relations-sankey` "ribbon opacity 0.7" and `relations-chord` link opacity — the claim
  is one alpha value.
- `relations-sankey` "node width 32 and gap 20" — two scalars, already asserted at the
  option level in unit tests.
- `Panel.canvas` (30k lines over 27 baselines) and `part-to-whole` (39k over 27) have
  the same shape of case in bulk.

Each converts to a drawn-primitive assertion in an `*.integration.test.*` sibling, which
`suiteShape` already requires and which reviews as code. Do these one family at a time,
never mixed with a format phase.

## Expected trajectory

Estimated when this was written, and what it actually came to:

| After   | Lines estimated | Lines actual | Size actual | Note                                   |
| ------- | --------------- | ------------ | ----------- | -------------------------------------- |
| start   | 265,626         | 265,626      | 4.0 MB      |                                        |
| Phase 1 | 265,626         | 265,626      | 4.0 MB      | renames only, byte-identical inventory |
| Phase 2 | ~38,400         | 27,924       | 2.09 MB     | 27,081 events, one line each           |
| Phase 3 | ~19,300         | 14,524       | 1.06 MB     | one pass instead of two                |
| Phase 4 | ~19,300         | —            | ~0.73 MB    | bytes only; needs the upstream change  |
| Phase 5 | fewer baselines | —            |             | per-case coverage decisions            |

4.0 MB → 1.06 MB with no loss in what is asserted, and both correctness bugs the bulk was
hiding resolved or evidenced: the pre-settle themeRiver layout is gone from the baselines,
and the invisible-curves-in-review gap has its upstream write-up.

## Order, and why

Move first (zero risk, and it makes every later diff land in its final home), then
reformat (mechanical, reversible, and it makes Phase 3 reviewable), then change what is
asserted (semantic, needs image review), then the upstream-dependent byte squeeze, then
coverage decisions. One commit per phase; the inventory diff and the rendered PNGs go in
each commit message.
