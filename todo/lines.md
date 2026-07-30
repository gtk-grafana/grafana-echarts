# ECharts `lines` series

> **Status: deferred, not blocked.** This is the fourth member of ECharts'
> relationship group, and the only one the **relations** family does not render —
> `graph`, `sankey` and `chord` all ship (see
> [node-graph.md](./node-graph.md)). It is left out because no Grafana frame kind
> supplies its input, not because of missing plugin code, so there is nothing to
> schedule until a scope decision is made. Everything below was checked against the
> installed **ECharts 6.1.0** source.

## Problem

`lines` draws **polylines between explicit coordinate pairs**. It is grouped with
`graph`/`sankey`/`chord` in ECharts' own docs and sits in this plugin's `SeriesType`
union (`src/editor/types.ts`), which makes it look like a fourth relations variant.
It is not: the other three read `option.data`/`nodes` plus `option.edges`/`links` and
resolve endpoints **by node id**, while `lines` wants literal geometry.

```javascript
// graph / sankey / chord — endpoints by id
{ data: [{ id: 'api' }, { id: 'db' }], links: [{ source: 'api', target: 'db' }] }

// lines — endpoints by coordinate
{ data: [{ coords: [[120.4, 36.1], [116.4, 39.9]] }] }
```

No Grafana data plane kind carries coordinate-pair polylines, which is why
[../data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md) gives it the
verdict **no Grafana source** — the only series type in that survey to score it.

## Proposal

None yet, deliberately. There are two candidate scopes, and they need different
prerequisites; picking one is a product decision, not an implementation detail.

### Candidate A — geo routes

The use `lines` was designed for: flight paths, network links between cities,
trade flows. `coords` are `[lng, lat]` pairs.

**Blocked on a scope decision.** Geo is explicitly out of scope in
`echarts-coverage.md`, and the blocker there is not the frame — a lat/lng pair is an
ordinary Numeric frame — but everything around it:

- **`GeoComponent` must be registered.** `lines` declares
  `dependencies = ['grid', 'polar', 'geo', 'calendar']` but its `install` registers
  only the view, model, layout and visual — **no coordinate component**. So geo has
  to be registered explicitly by `src/lib/echarts/echarts.ts`.
- **A GeoJSON must be supplied out of band** via `echarts.registerMap`. There is no
  Grafana frame for a basemap, so the plugin would have to ship or fetch one.
- **Projection and region-name normalization** are then their own design problem.

### Candidate B — cartesian origin/destination flow

Non-geo flow lines on an ordinary x/y grid: an OD matrix, a Sankey-ish flow drawn on
real axes, a set of measured segments.

**Blocked on a frame convention.** No data source emits one, so the plugin would have
to invent something like `x1, y1, x2, y2` (one row per segment) and document it as a
non-dataplane convention — the same category of decision as the node-graph frame pair,
but without an upstream precedent to copy. `GridComponent` is already registered, so
this needs no new runtime surface; `coordinateSystem: 'cartesian2d'` must be set
explicitly, because the series **defaults to `'geo'`** (see gaps).

### What it would add over what already ships

Little, absent geo — and this is the crux of the deferral. A `graph` series with
`layout: 'none'` over nodes carrying `fixedx`/`fixedy` already draws:

- straight segments between arbitrary pixel positions (the edges), **and**
- the endpoints themselves (the nodes), which `lines` does not draw at all.

So for the non-geo case the plugin can already produce the picture, from a frame
format Grafana actually documents. `lines` earns its place when the coordinate system
is geographic — which returns to Candidate A.

## Divergences / gaps

- **The default coordinate system is `geo`.** `LinesSeriesModel.defaultOption` sets
  `coordinateSystem: 'geo'` (plus `geoIndex: 0`), so registering `LinesChart` and
  feeding it cartesian coords without setting `coordinateSystem: 'cartesian2d'` lands
  on an unregistered component. In a dev build `getInitialData` throws
  `Unknown coordinate system geo`; that check **is** `NODE_ENV`-guarded, so a
  production build fails differently — quieter, not better. (Contrast the sankey cycle
  throw, which is unguarded and takes the panel down in production; see
  [node-graph.md](./node-graph.md).)
- **Multi-point lines need `polyline: true`.** The default is `false`, which draws only
  the first and last point of each `coords` array. The source notes the trade:
  _"polyline not support curveness, label, animation"_.
- **`value` is metadata, never geometry.** _Resolved here_ — this was the open question
  `echarts-coverage.md` recorded as unverified. `getInitialData` builds
  `new SeriesData(['value'], this)`, i.e. exactly **one** value dimension, with a
  custom getter: a bare-array item (plain coords) yields `NaN`, and an object item
  reads `dataItem.value`, indexing it when it is an array. So `value` feeds the tooltip
  and `visualMap` only; geometry comes exclusively from `coords`. `formatTooltip`
  labels a line by `name`, falling back to `fromName > toName`, and its own source
  comment warns that `value` may be the coords array in the bare form.
- **There is a second, flat data form.** `data` also accepts `ArrayLike<number>` — a
  packed typed array unpacked by `_processFlatCoordsArray` — used with
  `SeriesLargeOptionMixin` (`large`, `largeThreshold: 2000`) for very high line counts.
  A converter targeting scale would emit that rather than objects.
- **No node concept at all.** `fromName`/`toName` are tooltip strings, not references.
  Nothing deduplicates shared endpoints, so a plugin-side reshape would have to.

## Implementation sketch

Intentionally none — writing one now would bake in whichever candidate scope was
guessed. When a scope is chosen, the order is:

1. **Decide geo in or out.** In → Candidate A, and geo stops being out of scope
   repo-wide. Out → Candidate B and a frame convention.
2. **If Candidate B, fix the frame convention** (`x1,y1,x2,y2`, one row per segment?)
   and document it beside [node-graph.md](./node-graph.md) as another
   out-of-contract kind.
3. **Then** the usual pattern: converter → options → chart module → registry, plus
   registering `LinesChart` (and `GeoComponent` for Candidate A) in
   `src/lib/echarts/echarts.ts`, remembering to set `coordinateSystem` explicitly.

`lines` would most likely be **its own family**, not a relations variant: it shares no
converter with the node/link model, which is the whole reason `graph`/`sankey`/`chord`
could be one panel.

## Open questions

- **Is geo in scope for this plugin at all?** The single question gating Candidate A,
  and it is bigger than `lines` — `map` and the geo variants of
  `scatter`/`heatmap`/`pie` all wait behind the same answer. See the geo note in
  [../data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md).
- **Is there real demand for non-geo flow lines?** If not, Candidate B is a frame
  convention invented for a series nothing asked for, and `graph` with
  `layout: 'none'` already covers the picture.
- **Would a basemap ship with the plugin or be fetched?** Bundling GeoJSON has a size
  cost the tree-shaken runtime exists to avoid; fetching adds a network dependency a
  panel plugin cannot assume. Unresolved either way.
