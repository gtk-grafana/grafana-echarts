# Relations `graph`: the default force layout collapses into an unreadable clump

Found while fixing the SQL Expressions dashboard (`provisioning/dashboards/relations/node-graph-sql-expressions.json`).
Out of scope for that change, recorded here.

## Problem

`relationsLayout` defaults to `force` (`RELATIONS_LAYOUT_DEFAULT`, `src/lib/echarts/options/graph.ts:35`),
resolved by `getGraphLayout` (`graph.ts:125-131`) whenever the data does not pin every node's
`fixedx`/`fixedy`. A freshly-added relations panel therefore lands on `force`.

On a small graph that layout does not spread. A 5-node / 7-link service graph collapses into a
~60 px cluster with overlapping labels, and stays there — this is the settled steady state, not a
mid-simulation frame (verified by screenshotting a full-viewport `viewPanel` after a 20 s wait).

## Why it happens

`getGraphForce` (`graph.ts:138-150`) only emits a `force` object when the user has explicitly set
`relationsRepulsion`, `relationsEdgeLength` or `relationsGravity`; otherwise it returns `undefined`
and the key is omitted. That is the right instinct — let ECharts' defaults apply — but ECharts'
defaults are `repulsion: 50`, `edgeLength: 30`, `gravity: 0.1`
(https://echarts.apache.org/en/option.html#series-graph.force). Those are absolute values in the
series' coordinate space; they do not scale with the panel's pixel size or the node count, so on a
typical dashboard panel every node ends up inside a few tens of pixels of the centre.

## Evidence this is unexercised

Every `graph` panel across every provisioned relations dashboard explicitly sets
`"relationsLayout": "circular"`:

- `provisioning/dashboards/relations/chord.json` — panel 2
- `provisioning/dashboards/relations/sankey.json` — panel 5
- `provisioning/dashboards/relations/node-graph-testdata.json` — panels 6, 7, 8, 9, 10

So no provisioned dashboard renders the default. The workaround was applied per-panel rather than
fixed at the default, which is why the clump has not shown up in review.

## Options

1. **Scale the force defaults to the viewport.** Emit a `force` block whenever the user has not
   overridden it, deriving `repulsion` and `edgeLength` from the panel's width/height and node
   count. Closest to what core Grafana's Node graph does (it runs its own d3-force layout with
   size-aware parameters). Most work, best result, and it keeps `force` as a sensible default.
2. **Raise the static defaults.** Ship constants (e.g. `repulsion: 300`, `edgeLength: 120`) that
   read well at typical panel sizes. One-line change, but still wrong at the extremes — a 200-node
   graph and a 5-node graph want very different numbers.
3. **Change `RELATIONS_LAYOUT_DEFAULT` to `circular`.** Matches what every dashboard already does by
   hand, always readable, never overlapping. Loses the clustering information a force layout
   conveys, and diverges from core's node graph, which is force-directed.

## Recommendation

Option 1, falling back to option 2's constants when the panel size is unknown. `getGraphForce`
already owns this decision and has `ctx` available, so the change is local to
`src/lib/echarts/options/graph.ts`; the only new input it needs is the panel's pixel size, which
`RelationsSeriesContext` does not currently carry (see `ChartContext` in
`src/lib/echarts/charts/types.ts`).

If that is too much for now, option 2 is a strict improvement over today and is a one-line change.

## Next steps

- Decide between scaling and static constants.
- Thread panel width/height into `RelationsSeriesContext` if scaling.
- Add a provisioned panel that renders the **default** layout, so the default is exercised in review
  instead of being bypassed by a per-panel `circular` override.
- Consider dropping the now-redundant `"relationsLayout": "circular"` from the dashboards above once
  the default is readable, keeping one or two as explicit coverage of the circular option itself.
