# Hierarchy model

The hierarchy model is a **value-weighted tree**: every node has a name and a
number, and children nest inside their parent. It backs the two render variants
of the hierarchy family panel:

- **Treemap** (nested rectangles, the panel default) — `getTreemapSeries` in
  `src/lib/echarts/options/hierarchy.ts`
- **Sunburst** (radial rings) — `getSunburstSeries` in the same file

Both variants are built by the same chart module
(`src/lib/echarts/charts/hierarchy.ts`), which picks the variant from the
panel-level `ctx.seriesType`, and both consume one converter,
`frameToHierarchy` (`src/lib/echarts/converters/hierarchy.ts`). The converter
returns a chart-agnostic model — `HierarchyData` (`{ roots: HierarchyNode[] }`)
where each `HierarchyNode` is `{ name, value, self?, children? }`.

ECharts also has a `tree` series, and `'tree'` is a member of the `SeriesType`
union in `src/editor/types.ts`, but **no tree chart module ships**:
`hierarchySeriesTypes` is `['treemap', 'sunburst']`
(`src/editor/constants.ts`) and `resolveChartModule`
(`src/lib/echarts/charts/registry.ts`) throws for any unregistered type. The
reason is a property of the ECharts series, not of the data — see
[ECharts data specification](#echarts-data-specification) below.

## Grafana data plane equivalent

There is no hierarchy kind in the data plane contract, and the converter never
looks at `frame.meta.type`. It accepts **two unrelated input shapes**:

1. A **flame-graph nested-set frame** — out of contract, routed by
   `frame.meta.preferredVisualisationType`. This is the only Grafana frame
   format that actually carries a multi-level hierarchy; see the
   [flame graph spec](./flame-graph.md) for the full field contract.
2. A **flat categorical frame** — the **Numeric** kind
   (https://grafana.com/developers/dataplane/numeric), read through the shared
   [categorical model](./categorical.md). This produces a **single-level** tree
   (roots only, no children), i.e. a part-to-whole chart drawn as rectangles or
   rings rather than slices. Compare [part-to-whole.md](./part-to-whole.md).

## Detection

`frameToHierarchy` runs `frames.find(isFlameGraphFrame)` first; the **first**
matching frame takes the nested-set path. If no frame matches, every frame falls
through to the flat categorical path.

`isFlameGraphFrame` returns true when either of the following holds:

- `frame.meta.preferredVisualisationType === 'flamegraph'` — the canonical
  Grafana signal, or
- the frame has a `level` field of type `number`, **and** a `value` field of
  type `number`, **and** a field named `label` **of any type**.

Note the asymmetry: `level` and `value` are name- **and** type-checked, `label`
is name-checked only. A frame with a numeric or enum column named `label`
satisfies the shape check.

The field-shape fallback exists because provisioned TestData `csv_content`
frames cannot set `meta.preferredVisualisationType`. Two panels in
`provisioning/dashboards/hierarchy.json` ("Treemap (flame-graph nested set)" and
"Sunburst (flame-graph nested set)") feed the CSV
`level,value,self,label` and rely on it. The third pair of panels in that
dashboard feeds `category,value` and exercises the flat path; a fifth panel uses
the TestData `flame_graph` scenario, which carries the meta signal (the unit
fixture in `src/lib/echarts/converters/hierarchy.test.ts` mirrors that frame,
meta signal and enum `label` included).

### Suggestions

`isFlameGraphFrame` has a second caller: `scoreHierarchy`
(`src/lib/echarts/charts/fitness.ts`) applies it to `summary.rawFrames`, so the family
is suggested at `Best` for flame-graph data rather than only when the panel is picked
by hand. Render and suggestion therefore agree by construction.

Anything else falls back to the flat categorical path, whose gate shares
part-to-whole's slice bounds **plus a snapshot-shape requirement part-to-whole does
not have.** The asymmetry is real and worth knowing: this family has no
`reduceOptions`. The flat path emits one node per _row_ (see the table below), so
where a pie reduces a five-series time series to five slices, a treemap over the same
frames would draw one node per timestamp named `"0"`, `"1"`, …. A time dimension is
therefore disqualifying here and is not for part-to-whole — see
[part-to-whole.md](./part-to-whole.md#detection).

One consequence of counting nodes by row: a wide snapshot frame with many rows (a
large SQL table with two or more numeric columns) is still suggested, and still draws
one node per row. Treemaps tolerate that far better than a pie would, so it is left
alone, but it is a looser bound than the family's slice count implies.

## How a frame is read

### Nested-set path (`flameGraphToRoots`)

Rows are a depth-first traversal and **row order is significant**.

| Grafana field | Type checked      | Used as                                                                                                         |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `level`       | number (required) | Stack depth. A missing row value falls back to `0`, making that row a root.                                     |
| `value`       | number (required) | `HierarchyNode.value` — the cumulative value that sizes the tile/arc. Missing → `null`.                         |
| `label`       | any (required)    | `HierarchyNode.name`, resolved through `field.display ?? getDisplayProcessor(...)` so enum labels read as text. |
| `self`        | number (optional) | `HierarchyNode.self`. **Tooltip only** — never encoded geometrically.                                           |
| anything else | —                 | Ignored.                                                                                                        |

If `level`, `value`, or `label` is absent the function returns an empty root
list (and the converter then returns `null`).

The walk keeps a `stack` array where `stack[depth]` is the current node on the
active path:

- the parent is `stack[level - 1]` when `level > 0`; the node is appended to
  `parent.children` (created lazily);
- when `level === 0`, or when `stack[level - 1]` is `undefined`, the node is
  pushed onto `roots` instead;
- afterwards `stack[level] = node` and `stack.length = level + 1`, which
  truncates stale deeper ancestors left over from a previous, longer branch.

The truncation is what makes a sibling row (equal or shallower `level`) attach
to the right ancestor without any lookahead. A **malformed depth jump** — say a
`level` 2 row following a `level` 0 row — finds `stack[1] === undefined` and
therefore **degrades into an extra root** rather than throwing; its own
descendants still attach to it normally, so the result is a forest with more
than one top-level node. Nothing is logged.

### Flat categorical path

When no frame is a flame graph, the converter delegates to `frameToCategorical`
and flattens the result:

| Grafana field         | Used as                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| First `string` field  | Node names (one root per row). With no string field, row indices `"0"`, `"1"`, ... |
| First `number` field  | Node values (`categorical.series[0].values[row]`)                                  |
| Other `number` fields | **Dropped**                                                                        |
| `time` fields         | Ignored                                                                            |

Every node is a root; `children` is never populated on this path.

### Node colors

`getHierarchyValueField` re-derives the numeric field that sized the nodes — the
flame-graph `value` field, or the first numeric field of the categorical frame —
so `makeHierarchyColorResolver` (`src/lib/echarts/options/hierarchy.ts`) can
color nodes from that field's Color scheme. A legend color-picker override wins
by node name; an explicitly-configured by-value scheme colors every node from
its value; otherwise the classic palette colors top-level nodes by position and
deeper nodes inherit ECharts' derived shades.

## ECharts data specification

Pinned to **ECharts 6.1.0** (`package.json`). The plugin emits the tree items in
`toTreeData` (`src/lib/echarts/options/hierarchy.ts`) as
`{ name, value, self?, itemStyle?, children? }`. `self` is **not** an ECharts
option — the tooltip formatter reads `params.data`, which is the original item
object, so the extra property survives the round trip.

### `series.treemap.data`

An **array — a forest**, not a single tree ("Tips, the top level is an array";
"in fact the data structure is not 'tree', but is 'forest'"). Each node is

```javascript
{ name: 'description of this node', value: 2323, children: [ /* recursive */ ] }
```

`value` may be a **number or an array**; when it is an array the **first slot**
is the area and the remaining slots are extra dimensions available to
`levels[].visualDimension` for visual mapping. The plugin always emits a plain
number.

Parent auto-summing is **not documented** in the treemap option reference — the
documented example gives every parent an explicit value. It _is_ implemented in
the 6.1.0 source: `completeTreeValue` in the ECharts repo
(`chart/treemap/TreemapSeries.ts`, linked under References) walks the tree
postorder and, when a node's value is `null`/`NaN`, substitutes the sum of its
children (clamping negatives to `0`). Since the behavior is
undocumented, treat it as an implementation detail and supply parent values
explicitly. The plugin does: flame-graph `value` is already cumulative, and the
flat path has no parents at all. The one case that leans on it is a nested-set
row whose `value` is null — `toTreeData` maps `null` to `undefined`, and ECharts
then fills the tile from the children.

The plugin sets `leafDepth: 5` and `nodeClick: 'zoomToNode'`, so at most five
levels are drawn at once and deeper nodes are reachable only by drilling down.

### `series.sunburst.data`

An **array of nodes** (the innermost ring), each `{ name, value, children }`,
recursive through `children`. Parent auto-summing **is** documented here: "If
contains children, value can be left unset, and sum of children values will be
used in this case. If is set, and is larger than sum of children nodes, the
reset can be used for other parts in parent."

`levels` is a separate array whose **first element is the special
return-to-parent centre ring** used during drill-down ("data mining"); elements
after it style the rings from centre outward. The plugin does not set `levels`
and sets `nodeClick: false`, so there is no drill-down and no return-to-parent
ring.

### `series.tree.data` — why there is no tree chart

Two reasons, both about the series rather than the frame:

- **One root per series.** The option reference documents the outermost layer as
  a **single object** representing the root node. The 6.1.0 typings declare
  `data?: TreeSeriesNodeItemOption[]`, and `TreeSeries.getInitialData` wraps
  `option.data` as the `children` of a virtual root — but `treeLayout` then lays
  out `virtualRoot.children[0]` only. A forest therefore needs one series per
  root. Treemap and sunburst take the forest directly, which matters because a
  malformed nested set (and any multi-root profile) produces exactly that.
- **`value` does not size the node.** The reference defines tree `value` as "The
  value of the node, displayed in the tooltip"; node size comes from
  `symbolSize`. A tree is a topology diagram, not a value-weighted one, so it is
  a poor fit for profiling data where the number _is_ the point.

### Can a flat Grafana frame supply this?

Not directly. **Nested `children` is the barrier**: a data frame is columnar and
one cell cannot hold a variable-length child array, so a hierarchy has to be
encoded some other way and then rebuilt. Grafana has exactly one convention for
that — the flame-graph nested set (`level` plus depth-first row order), which is
why it is the only multi-level input this converter accepts. A parent-id/child-id
edge table would also encode a tree, but Grafana has **no data plane convention**
for one (the closest is the node graph, which is a general digraph — see
[node-graph.md](./node-graph.md)), so nothing reads it. Any other flat frame
degenerates to the single-level forest described above. See
[echarts-coverage.md](./echarts-coverage.md) for the wider ECharts surface.

## Divergences from the data plane spec

- **Single frame only.** The first flame-graph frame wins; otherwise
  `findCategoricalFrame` returns the first frame with a numeric field and the
  rest are dropped. Multi-frame responses are not merged — see
  [../todo/multiple-frames.md](../todo/multiple-frames.md).
- **No fallback after a positive detection.** A frame tagged
  `preferredVisualisationType: 'flamegraph'` that lacks `level`, `value`, or
  `label` yields an empty root list, and `frameToHierarchy` returns `null`
  without ever trying the flat categorical path — even when the frame has
  perfectly good numeric columns.
- **Detection is a false-positive risk.** Any frame with a numeric `level`, a
  numeric `value`, and _any_ field named `label` is read as a nested set. The
  untyped `label` check is the loosest part of it.
- **Row order is load-bearing.** The nested set only survives while rows stay in
  depth-first order, so a sort transformation silently rebuilds a different
  tree. Nothing validates the ordering.
- **Malformed depth jumps are silent.** They surface as extra top-level nodes
  (see the stack walk above), not as an error or a no-data view.
- **`self` is decorative.** It is carried onto the ECharts item and printed in
  the tooltip, and nothing else. The diff-profile fields documented in the
  [flame graph spec](./flame-graph.md), `valueRight` and `selfRight`, are
  **unimplemented** — neither name occurs anywhere in `src/`. Comparison
  profiles render as their baseline side only. Tracked alongside
  [../todo/flame-graph.md](../todo/flame-graph.md).
- **First numeric field only** on the flat path, matching pie. Extra numeric
  fields are dropped rather than becoming a second level or a second series.
- **Field `config.unit` and display processing** apply to the tooltip via the
  panel's `formatValue`, but node labels drawn inside the chart are ECharts'
  own — the plugin does not set `label.formatter` for either variant.
- **Depth is capped visually.** `leafDepth: 5` means a profile deeper than five
  levels is only partly visible until the user drills in; sunburst has no
  equivalent cap but thin outer rings become unreadable.
- **The legend lists top-level nodes only** (`buildLegendItems` in
  `src/lib/echarts/charts/hierarchy.ts`), so on a flame graph it shows a single
  entry — the root.

`frameToHierarchy` returns `null` when the flame-graph path yields no roots and
when no frame has a numeric field, letting callers fall back to a no-data view.

## Example

The nested-set CSV provisioned in `provisioning/dashboards/hierarchy.json`:

| level | value | self | label  |
| ----- | ----- | ---- | ------ |
| 0     | 100   | 10   | total  |
| 1     | 60    | 20   | render |
| 2     | 40    | 40   | draw   |
| 1     | 30    | 30   | io     |

The final row is `level` 1 again, so `stack.length = level + 1` drops the
`level` 2 entry and `io` attaches to `total`, not to `draw`. `frameToHierarchy`
returns:

```typescript
{
  roots: [
    {
      name: 'total',
      value: 100,
      self: 10,
      children: [
        { name: 'render', value: 60, self: 20, children: [{ name: 'draw', value: 40, self: 40 }] },
        { name: 'io', value: 30, self: 30 },
      ],
    },
  ],
}
```

which `toTreeData` emits as the treemap/sunburst `series.data` forest (one root
here, colors elided):

```javascript
[
  {
    name: 'total',
    value: 100,
    self: 10,
    children: [
      { name: 'render', value: 60, self: 20, children: [{ name: 'draw', value: 40, self: 40 }] },
      { name: 'io', value: 30, self: 30 },
    ],
  },
];
```

The flat CSV from the same dashboard (`category,value` with rows `Sales,43`,
`Admin,10`, `IT,30`, `Marketing,18`, `Support,7`) has no `level` field, so it
takes the categorical path and yields five valued roots and no `children`.

## References

- Treemap series data (`series-treemap.data`):
  https://echarts.apache.org/en/option.html#series-treemap.data
- Sunburst series data and `levels`:
  https://echarts.apache.org/en/option.html#series-sunburst.data
- Tree series data (`series-tree.data`):
  https://echarts.apache.org/en/option.html#series-tree.data
- Grafana Numeric kind: https://grafana.com/developers/dataplane/numeric
- Treemap parent auto-summing (`completeTreeValue`, undocumented):
  https://github.com/apache/echarts/blob/6.1.0/src/chart/treemap/TreemapSeries.ts
- Tree single-root layout (`treeLayout`):
  https://github.com/apache/echarts/blob/6.1.0/src/chart/tree/treeLayout.ts
