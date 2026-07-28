# Flame graph

A **flame graph** visualizes hierarchical profiling data (a call tree weighted by
CPU time, memory, samples, ...). Grafana models it as a **single** column-oriented
data frame in a **nested set model**.

> **Not a data plane contract kind.** Like [node-graph.md](./node-graph.md), flame
> graph is **out of the Grafana data plane contract**. It carries no
> `frame.meta.type`. Grafana identifies it through a separate routing signal
> (`frame.meta.preferredVisualisationType`).

> **Implemented.** This plugin consumes these frames: `frameToHierarchy`
> (`src/lib/echarts/converters/hierarchy.ts`) rebuilds the call tree from the
> nested set and renders it as a **treemap** or **sunburst** — see
> [hierarchy.md](./hierarchy.md). This doc describes the **input frame format**;
> the hierarchy doc describes the tree model and the charts. ECharts has no native
> flame/icicle series, so the classic left-aligned stacked-bar layout (a `custom`
> `renderItem` series) remains unbuilt — `todo/flame-graph.md` sketches it, though
> that doc predates the hierarchy converter and still reads as if nothing exists.

Live examples ship in `provisioning/dashboards/hierarchy.json` ("ECharts
Hierarchy treemap and sunburst"): _Treemap (flame-graph nested set)_ and
_Sunburst (flame-graph nested set)_ build the frame from TestData CSV content and
are detected by field shape, while _Treemap (TestData flame graph)_ uses
TestData's built-in `flame_graph` scenario, which carries the real
`meta.preferredVisualisationType` signal and an enum `label` field.

Field names below come from Grafana's flame graph data transform
(`packages/grafana-flamegraph/src/FlameGraph/dataTransform.ts`) and the flame
graph
[panel Supported data formats](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/flame-graph/#supported-data-formats).

## Nested set model

Each row of the frame is one item (a function call / stack frame). An item is
encoded by its nesting `level` (an integer) **and by its position in the frame** —
**row order is significant**. The order is a **depth-first traversal** of the
flame graph, which lets Grafana rebuild the tree by walking rows and treating
`level` as the stack depth. This avoids variable-length values (like a children
array) inside the frame.

- A row whose `level` is greater than the previous row's is a **child** of that
  previous item.
- A row whose `level` is less than or equal to the previous row's is a **sibling**
  of the nearest earlier item at `level - 1`.

## Detection

Grafana treats a response as a flame graph when:

- `frame.meta.preferredVisualisationType === 'flamegraph'`.

`isFlameGraphFrame` (`src/lib/echarts/converters/hierarchy.ts`) takes that as the
canonical signal, then falls back to the nested-set **field shape** — a numeric
`level`, a numeric `value`, and a `label` field — so provisioned TestData CSV,
which cannot set the meta signal, still renders.

## Required fields

| Field name | Type           | Description                                                                                                      |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `level`    | number         | Nesting level of the item — how many items sit between this item and the top of the flame graph.                 |
| `value`    | number         | Absolute or cumulative value of the item. Translates to the item's **width** in the graph.                       |
| `label`    | string or enum | Label shown for the item (typically the function name). May be an enum field resolved via its display processor. |
| `self`     | number         | Self value — usually the item's cumulative `value` minus the sum of its immediate children's cumulative values.  |

## Optional fields (diff profiles)

Diff (comparison) profiles add a right-hand side. When present, the tooltip and
top table show baseline, comparison, and diff values.

| Field name   | Type   | Description                                          |
| ------------ | ------ | ---------------------------------------------------- |
| `valueRight` | number | Comparison-side cumulative value for a diff profile. |
| `selfRight`  | number | Comparison-side self value for a diff profile.       |

Both diff fields must be present together — supplying only one is a malformed
frame.

> **Spec only.** `valueRight` and `selfRight` are documented here for
> completeness but are **not read anywhere in `src/`**: `flameGraphToRoots`
> (`src/lib/echarts/converters/hierarchy.ts`) resolves only `level`, `value`,
> `self`, and `label`, so a diff profile currently renders as its baseline side
> alone.

## Example

| level | value    | self   | label                                     |
| ----- | -------- | ------ | ----------------------------------------- |
| 0     | 16.5 Bil | 16.5 K | total                                     |
| 1     | 4.10 Bil | 4.10 k | test/pkg/agent.(\*Target).start.func1     |
| 2     | 4.10 Bil | 4.10 K | test/pkg/agent.(\*Target).start.func1     |
| 3     | 3.67 Bil | 3.67 K | test/pkg/distributor.(\*Distributor).Push |
| 4     | 1.13 Bil | 1.13 K | compress/gzip.(\*Writer).Write            |
| 5     | 1.06 Bil | 1.06 K | compress/flat.(\*compressor).write        |

Row 0 (`level` 0) is the root; each subsequent deeper `level` is a child of the
item above it, reconstructing the call tree from row order alone.

The same frame as a `toDataFrame` partial (the shape used in unit tests; `value`
and `self` are the raw numbers behind the display strings above):

```typescript
import { FieldType, toDataFrame } from '@grafana/data';

const flameGraph = toDataFrame({
  name: 'response',
  refId: 'A',
  meta: { preferredVisualisationType: 'flamegraph' },
  fields: [
    { name: 'level', type: FieldType.number, values: [0, 1, 2, 3, 4, 5] },
    {
      name: 'value',
      type: FieldType.number,
      values: [16_500_000_000, 4_100_000_000, 4_100_000_000, 3_670_000_000, 1_130_000_000, 1_060_000_000],
    },
    { name: 'self', type: FieldType.number, values: [16_500, 4_100, 4_100, 3_670, 1_130, 1_060] },
    {
      name: 'label',
      type: FieldType.string,
      values: [
        'total',
        'test/pkg/agent.(*Target).start.func1',
        'test/pkg/agent.(*Target).start.func1',
        'test/pkg/distributor.(*Distributor).Push',
        'compress/gzip.(*Writer).Write',
        'compress/flat.(*compressor).write',
      ],
    },
  ],
});
```

A diff profile adds the optional `valueRight` and `selfRight` fields (both
present together):

```typescript
const diffFlameGraph = toDataFrame({
  name: 'response',
  refId: 'A',
  meta: { preferredVisualisationType: 'flamegraph' },
  fields: [
    { name: 'level', type: FieldType.number, values: [0, 1] },
    { name: 'value', type: FieldType.number, values: [100, 60] },
    { name: 'self', type: FieldType.number, values: [40, 60] },
    { name: 'valueRight', type: FieldType.number, values: [120, 90] },
    { name: 'selfRight', type: FieldType.number, values: [30, 90] },
    { name: 'label', type: FieldType.string, values: ['total', 'main.work'] },
  ],
});
```

## References

- Flame graph panel supported data formats:
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/flame-graph/#supported-data-formats
- Field validation / transform (`grafana-flamegraph`):
  https://github.com/grafana/grafana/blob/main/packages/grafana-flamegraph/src/FlameGraph/dataTransform.ts
- `preferredVisualisationType` enum (`grafana-data/src/types/data.ts`):
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/data.ts
