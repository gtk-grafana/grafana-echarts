# `edgeLabels/` has no unit test

Noted while splitting `lib/echarts/features/edgeLabelLayout.ts` into
`lib/echarts/relations/edgeLabels/{geometry,reveal,register}.ts`. Nothing here is
implemented — this is the gap, not a plan to close it.

The three modules are covered only end-to-end, by
[labels.integration.test.tsx](../src/lib/components/integration-tests/relations/labels.integration.test.tsx)
and the relations canvas baselines. There is no `*.test.ts` for any of them.

`geometry.ts` is the one that wants one. It reads `Line`/`Graph` zrender internals —
`readGraph`, `isLabelHost`, `labelBox` — none of which is public ECharts API, so it is
the module an ECharts upgrade breaks, and an integration test tells you _that_ the edge
labels are wrong rather than _which_ narrowing stopped matching. The pure parts are
already testable without a chart: `overlaps` is two rects, and `labelBox` is a
transform applied to a rect.

`reveal.ts` holds per-chart state in a `WeakMap` keyed on the chart instance, so a unit
test needs only an object as the key — `setRevealIndex` / `applyReveal` / `markKey` are
reachable without ECharts at all.

`register.ts` is the `registerUpdateLifecycle` wiring. Least worth unit-testing; the
integration test is the right level for it.

Related: [docs/relations-canvas-coverage.md](../docs/relations-canvas-coverage.md) for
what the rendered suites already pin, so a unit test is not written for something a
baseline already proves.
