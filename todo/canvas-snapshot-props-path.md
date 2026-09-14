# Canvas baselines duplicate every path they draw — blocked on `jest-canvas-mock-compare`

Phase 4 of [relations-test-refactor.md](relations-test-refactor.md). Phases 0-3 landed;
this one cannot be done in this repo. The spike the plan asked for is done and the
evidence is below.

## The duplication

Every `stroke`, `fill` and `clip` event embeds `props.path`, the path it is about — a
verbatim copy of the `moveTo` / `lineTo` / `bezierCurveTo` / `quadraticCurveTo` / `arc`
events recorded immediately before it. For the _assertion_ it is pure duplication.

Measured on the committed baselines after Phase 3:

|                                  |                        |
| -------------------------------- | ---------------------- |
| Events                           | 13,681                 |
| Events carrying `props.path`     | 1,301 (9.5%)           |
| Bytes                            | 1.05 MB                |
| Bytes with `props.path` stripped | 0.73 MB (**-30%**)     |
| Lines                            | 14,011 — **unchanged** |

Bytes only. One event is one line either way, so this buys nothing for readability; the
long lines it shortens are the p99 (504 chars) and the max (951).

## Why it cannot be stripped here

`toMatchCanvasSnapshot` snapshots and payloads the **same array**: `received` goes to
`toMatchSnapshot(received)` and into `payload.actual`. Stripping it in
`normalizeCanvasEvents` (or in the serializer) would shrink the baseline and blank the
picture, because the viewer replays shapes from `props.path` and from nothing else.

**The spike, as evidence.** Take a sankey `base` payload, remove `props.path` from its
`expected` half only, set `snapshotAssertionPassed: false`, and render it:

    GEN_CANVAS_OUTPUT_ON_PASS=1 npx jest --ci src/lib/components/canvas-tests/relations/sankey.canvas.test.tsx
    # edit the payload in .jest-canvas-mock-compare/ as above
    node scripts/canvas-shots.mjs <payload>.json

The Expected panel keeps its four labels — `Gateway`, `API`, `Web`, `DB` — and loses
**every bar and ribbon**; nothing but text is left. Actual, the same payload with
`props.path` intact, draws the chart, and Diff is the whole sankey. (The PNG lands in the
gitignored `.jest-canvas-mock-compare/shots/`, so it is not committed here.) The viewer
has every path op in the flat event stream, in order, and does not use them — the same
gap that made
[the `quadraticCurveTo` patch](../jest-setup.js) necessary: a curve missing from that one
array drew nothing at all, so a relations graph with any curveness rendered its nodes and
arrowheads with no lines between them.

## The upstream change

One of, in `grafana/jest-canvas-mock-compare`:

1. Strip `props.path` inside the matcher for the snapshot only, keeping it in the payload.
   Smaller change; leaves the viewer's replay as it is.
2. Teach the viewer to replay the flat event stream, after which `props.path` can go
   everywhere — from the snapshot, from the payload, and from the `quadraticCurveTo`
   patch in `jest-setup.js` that exists only to keep it correct.

**(2) is better**: it removes the duplicate representation rather than hiding one copy,
and it is what makes the `jest-setup.js` patch deletable. Until one lands, leave
`props.path` alone and take the 30%.
