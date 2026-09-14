# Canvas baselines duplicate every path they draw

Blocked on a change in `grafana/jest-canvas-mock-compare`; nothing to do in this repo yet.

## The duplication

Every `stroke`, `fill` and `clip` event embeds `props.path`, the path it is about — a
verbatim copy of the `moveTo` / `lineTo` / `bezierCurveTo` / `quadraticCurveTo` / `arc`
events recorded immediately before it. For the _assertion_ it is pure duplication.

Measured on the committed baselines:

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

To see it: take a sankey `base` payload, remove `props.path` from its `expected` half
only, set `snapshotAssertionPassed: false`, and render it —

    GEN_CANVAS_OUTPUT_ON_PASS=1 npx jest --ci src/lib/components/canvas-tests/relations/sankey.canvas.test.tsx
    # edit the payload in .jest-canvas-mock-compare/ as above
    node scripts/canvas-shots.mjs <payload>.json

— and the Expected panel keeps its four labels while losing every bar and ribbon. The
viewer has every path op in the flat event stream, in order, and does not use them. That
is the same gap behind [the `quadraticCurveTo` patch](../jest-setup.js): a curve missing
from that one array draws nothing at all, so a relations graph with any curveness renders
its nodes and arrowheads with no lines between them.

## The upstream change

One of, in `grafana/jest-canvas-mock-compare`:

1. Strip `props.path` inside the matcher for the snapshot only, keeping it in the payload.
   Smaller change; leaves the viewer's replay as it is.
2. Teach the viewer to replay the flat event stream, after which `props.path` can go
   everywhere — from the snapshot, from the payload, and from the `quadraticCurveTo` patch
   in `jest-setup.js` that exists only to keep it correct.

**(2) is better**: it removes the duplicate representation rather than hiding one copy,
and it is what makes the `jest-setup.js` patch deletable. Until one lands, leave
`props.path` alone and take the 30%.
