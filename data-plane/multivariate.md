# Multivariate model

The multivariate family plots **several measures per entity** on a shared set of
axes. ECharts offers two coordinate systems for this, and they are exact
transpositions of each other:

- **Radar** — `src/lib/echarts/converters/radar.ts`, rendered by
  `src/lib/echarts/charts/radar.ts`. Implemented. A thin adapter over the shared
  [categorical model](./categorical.md).
- **Parallel coordinates** — _spec only, not implemented_. `'parallel'` exists in
  the `SeriesType` union (`src/editor/types.ts`) and is called out as roadmap in
  `src/modules/multivariate/module.tsx` and
  `src/modules/multivariate/parity.md`, but there is no converter, no chart
  module, and the renderer is not registered.

Radar reuses the categorical model wholesale, so **how a frame is read is
documented in [categorical.md](./categorical.md)** — this doc covers what is
specific to the multivariate family: the ECharts option shape the converter has
to fill, and the axis/shape transposition that decides which of the two charts a
given frame actually suits.

ECharts option names below are pinned to **ECharts 6.1.0** (`package.json`).

## Grafana data plane equivalent

The **Numeric** kind — a table of string and number columns, or a Prometheus
instant vector. See https://grafana.com/developers/dataplane/numeric.

As with every categorical chart in this plugin, `frame.meta.type` is never
inspected: `NumericWide`, `NumericMulti`, and `NumericLong` all take the same
path, and a `TimeSeriesWide` frame is read the same way with its time field
ignored (see [time-series.md](./time-series.md) for the chart that does read it).

## Detection

There is no data-driven detection for this family. Every nested panel fixes its
own family, and the multivariate family resolves `'Auto'` **unconditionally** to
`'radar'` (`resolveAutoSeriesType` in `src/lib/echarts/charts/autoSeriesType.ts`)
— it never inspects the frames. Radar and parallel coordinates read the identical
categorical model, so there is no frame shape that would pick one over the other;
`'radar'` is simply the family's default.

The only data-sensitive signal is the Visualization Suggestions supplier
(`src/modules/multivariate/suggestions.ts`), which scores through
`scoreMultivariate` (`src/lib/echarts/charts/fitness.ts`). It offers Radar and
Parallel cards when all three hold:

- a **snapshot shape** — a Numeric dataplane frame, instant data, or no `time`
  field at all. A multi-point time series can no longer reach this family.
- **axes** (`rowCountMax`) in `[MULTIVARIATE_MIN_AXES, MULTIVARIATE_MAX_AXES]`
  (3–50). Axes come from _rows_, because `frameToCategorical` turns each row into
  one indicator — and it reads a single frame, so this is `rowCountMax` rather than
  `rowCountTotal`. Fewer than three is a line, not a polygon.
- **polygons** (numeric field count) in `[2, MULTIVARIATE_MAX_SERIES]` (2–12). One
  polygon has nothing to be compared against.

The axis ceiling is what stops the crash this family shipped with: the gate used to
be "at least two numeric fields" and nothing else, so a 500-series Prometheus
response scored fit and `radarToEChartsOption` was handed 500 axes. Suggestion
previews additionally truncate to `MULTIVARIATE_PREVIEW_MAX_ROWS` (25) rows, so a
card draws 25 indicators at most — see [performance.md](../docs/performance.md).

## How a frame is read

`radarToEChartsOption` calls `frameToCategorical`
(`src/lib/echarts/converters/categorical.ts`) and re-labels the result. Nothing
about frame reading is radar-specific:

| Grafana field        | Used as                                                             |
| -------------------- | ------------------------------------------------------------------- |
| First `string` field | One **radar axis (indicator)** per row value                        |
| Each `number` field  | One **polygon**, its positional `values` array                      |
| `time` fields        | Ignored                                                             |
| Field color config   | `data[].itemStyle.color` for that polygon                           |
| Field display name   | `data[].name` (polygon name, and the legend entry)                  |
| Field `config.max`   | **Not used** — `indicator.max` is computed from the observed values |

With no string field, row indices (`"0"`, `"1"`, ...) become the axis names
(`resolveCategoriesFromField` in `src/lib/echarts/converters/frames.ts`). Only
the first frame with a numeric field is read; see
[categorical.md](./categorical.md) for the full mapping and its trade-offs.

`indicator[].max` is computed **per axis**, not globally: for each row,
`radarToEChartsOption` scans every polygon's value at that row index and keeps
the largest. When no polygon has a numeric value at that row the key is omitted
entirely so ECharts auto-scales that axis.

## ECharts data specification

### Radar

Radar splits its data across **two option nodes**, and the split is the whole
reason the converter returns a `RadarData` pair (`indicator` + `data`) rather
than a series:

- `radar.indicator[]` lives on the **`radar` coordinate-system component**, not
  on the series. It is the axis definition.
- `series.data[].value` is a flat array of numbers **positionally aligned to
  that indicator array**: `value[i]` is plotted on `indicator[i]`. The ECharts
  docs say it directly — "value item array contains data that is corresponding
  to `radar.indicator`".

All polygons live in a **single** ECharts series; each polygon is one item in
`series.data` (see `buildOption` in `src/lib/echarts/charts/radar.ts`, which
emits `radar: { indicator }` and `series: [{ type: 'radar', data }]`).

```javascript
{
  radar: {
    indicator: [
      { name: 'Sales', max: 50 },  // axis 0
      { name: 'Admin', max: 14 },  // axis 1
      { name: 'IT',    max: 30 },  // axis 2
    ],
  },
  series: [
    {
      type: 'radar',
      data: [
        // `color` comes from each field's standard Color scheme config.
        { name: 'Budget', value: [43, 10, 30], itemStyle: { color: '...' } },
        { name: 'Actual', value: [50, 14, 28], itemStyle: { color: '...' } },
      ],
    },
  ],
}
```

Notes on the indicator contract, from
https://echarts.apache.org/en/option.html#radar.indicator:

- `indicator[].max` is "an optional configuration, but we recommend to set it
  manually" — hence the converter computing one.
- `indicator[].min` defaults to `0`. The converter never sets it.
- **Radar has no `dataset` support.** The ECharts handbook lists the series that
  accept a `dataset`: `line`, `bar`, `pie`, `scatter`, `effectScatter`,
  `parallel`, `candlestick`, `map`, `funnel`, `custom` — radar is absent. In the
  source, `RadarSeriesModel.getInitialData` goes through
  `createSeriesDataSimply` with `generateCoord: 'indicator_'` rather than the
  dataset-aware `createSeriesData` path that parallel uses. A flat Grafana frame
  therefore **cannot** be handed to radar as a table; it must be materialized
  into the `indicator` + `value[]` pair above, which is exactly what the
  converter does.
- Radar has no `axisExpandable`; the radar component has no facility for
  collapsing a large number of axes (parallel does).

### Parallel coordinates (not implemented)

Parallel uses three cooperating option nodes — `parallel` (the coordinate
system), `parallelAxis[]` (the axes), and `series-parallel` (the polylines):

- `series.data` is an **array of arrays**. Each inner array is one row; each
  position in it is one dimension. A row may also be an object
  (`{ value: [...], lineStyle: {...} }`) to style a single polyline.
- Each `parallelAxis[]` entry declares `dim`, the **dimension index in the data,
  starting from 0**. Axis order on screen is the order of the `parallelAxis`
  array; `dim` decides which column it reads.
- An axis with `type: 'category'` carries its own `data: [...]` list of category
  names. If `type` is omitted but `data` is present, ECharts infers
  `type: 'category'`; if `type: 'category'` is set without `data`, the
  categories are auto-collected from `series.data` / `dataset.source`.
- Configuration common to every axis goes in `parallel.parallelAxisDefault`,
  which is merged into each `parallelAxis` before the axes are initialized.
- For large data, ECharts recommends `series-parallel.lineStyle.width` of `0.5`
  "(or less), which may improve performance significantly". The default is `1`
  with `opacity: 0.45`.
- `parallel.axisExpandable` is the documented escape hatch when a frame has more
  dimensions (roughly 50+) than fit across the panel.

```javascript
{
  parallel: {
    parallelAxisDefault: { type: 'value', nameLocation: 'end', nameGap: 20 },
  },
  parallelAxis: [
    { dim: 0, name: 'cpu' },
    { dim: 1, name: 'memory' },
    { dim: 2, name: 'state', type: 'category', data: ['ok', 'degraded'] },
  ],
  series: [
    {
      type: 'parallel',
      lineStyle: { width: 0.5 },
      data: [
        [0.42, 71, 'ok'], // one row of the frame
        [0.91, 88, 'degraded'],
      ],
    },
  ],
}
```

**Fit verdict: excellent — a better structural match for a Grafana frame than
radar.** A wide Numeric frame maps 1:1 with no reshaping:

- every numeric field becomes one axis, `dim: <field index>`, and inherits that
  field's unit, min/max, and decimals naturally, because the axis _is_ the field;
- every frame row becomes one polyline;
- a string field becomes a `type: 'category'` axis whose `data` is that field's
  distinct values;
- and because parallel is on the `dataset` support list and its series model
  extends `SeriesEncodeOptionMixin` (`ParallelSeriesModel` in the ECharts
  source), a frame could even be fed as `dataset.source` with `encode` rather
  than copied into `series.data`.

### Transposition: radar and parallel are mirror images

This is the whole story of the family. Radar puts **rows on the axes**; parallel
puts **fields on the axes**.

|                        | Radar (implemented)                                    | Parallel (spec only)                                  |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| One axis per           | frame **row** (`indicator[]`)                          | frame **field** (`parallelAxis[]`, `dim: fieldIndex`) |
| One shape per          | frame **field** (a polygon)                            | frame **row** (a polyline)                            |
| Axis names from        | first string field's row values                        | field display names                                   |
| Axis scale             | `indicator.max` = largest value any polygon reaches    | per-axis `min`/`max`/`scale`, or auto                 |
| Data shape             | `series.data[].value: number[]` aligned to `indicator` | `series.data: array-of-arrays`, aligned by `dim`      |
| Category values        | only as axis names                                     | a first-class `type: 'category'` axis with `data`     |
| `dataset` / `encode`   | not supported                                          | supported                                             |
| Adding a metric column | adds a polygon                                         | adds an axis                                          |
| Adding a row           | adds an axis                                           | adds a polyline                                       |

The practical consequence: radar wants a frame whose **numeric fields are
commensurable** (same unit, comparable magnitude), because they are all plotted
against the same per-row axis. Parallel wants the opposite and is happy with
mixed units, because each field owns its axis. A typical Grafana table — one row
per host, one column per unrelated metric — is the parallel shape, and radar
reads it transposed.

## Example

The frame the converter's unit tests use
(`src/lib/echarts/converters/radar.test.ts`):

| category | Budget | Actual |
| -------- | ------ | ------ |
| Sales    | 43     | 50     |
| Admin    | 10     | 14     |
| IT       | 30     | 28     |

```typescript
import { FieldType, toDataFrame } from '@grafana/data';

const frame = toDataFrame({
  fields: [
    { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
    { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
    { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
  ],
});
```

Radar reads that as **three axes** (`Sales`, `Admin`, `IT`) with per-axis maxima
`50`, `14`, `30` and **two polygons** (`Budget`, `Actual`) — the option shown
under [Radar](#radar) above. Parallel would read the same frame as **two axes**
(`Budget`, `Actual`) with **three polylines**, one per row, and the `category`
column as a third, categorical axis.

## Divergences from the data plane spec

Radar inherits every divergence of the [categorical model](./categorical.md) —
single frame only, time fields ignored, first string field wins, labels not used
for identity, no caps. On top of those:

- **Rows are assumed commensurable.** Every numeric field is plotted against the
  same per-row axis, but Grafana units, decimals, min, and max are **per field**.
  A frame mixing a millisecond column with a count column renders without
  complaint on shared axes. The tooltip formats per polygon (`dataIndex` selects
  the polygon's field formatter, `getTooltipValueFormatter` in
  `src/lib/echarts/charts/radar.ts`), so the numbers in the tooltip are
  correctly unit-formatted per polygon while the axis they sit on is not.
- **`indicator.max` ignores the standard field config.** It is always the largest
  _observed_ value on that axis, so the leading polygon touches the outer ring on
  every axis and the ring itself carries no fixed meaning. A field's standard
  `Max` never reaches the indicator. `src/modules/multivariate/parity.md` records
  the same gap from the editor side.
- **`indicator.min` is never set**, so ECharts' default of `0` applies. Frames
  with negative values are outside that range; the exact rendering is
  **unverified**.
- **Every row becomes an axis, uncapped.** A hundred-row frame produces a hundred
  indicators, and radar has no `axisExpandable` equivalent.
- **Parallel is unreachable.** `'parallel'` is in the `SeriesType` union
  (`src/editor/types.ts`) but not in `radarSeriesTypes`
  (`src/editor/constants.ts`), so `resolveChartModule`
  (`src/lib/echarts/charts/registry.ts`) throws for it; `ParallelChart` is not
  registered in `src/lib/echarts/echarts.ts`; and Auto resolves the family to
  `'radar'` unconditionally. Implementing it needs a converter, a chart module, a
  registry entry, and the renderer import.
- **No provisioned coverage.** `grep -ri radar provisioning/` returns **0 hits**
  (as does `parallel`), so the family has no dev dashboard in
  `provisioning/dashboards/` — unlike the heatmap, hierarchy, and part-to-whole
  families (see [part-to-whole.md](./part-to-whole.md)). Radar is exercised only
  by unit tests.

`radarToEChartsOption` returns `null` when `frameToCategorical` finds no frame
with a numeric field, and `buildOption` propagates that `null` so the panel falls
back to a no-data view.

## References

- Radar coordinate system and `indicator`:
  https://echarts.apache.org/en/option.html#radar
- Radar series data (`value` aligned to `radar.indicator`):
  https://echarts.apache.org/en/option.html#series-radar.data
- Parallel coordinate system and `parallelAxisDefault`:
  https://echarts.apache.org/en/option.html#parallel
- Parallel axes (`dim`, `type: 'category'`, `data`):
  https://echarts.apache.org/en/option.html#parallelAxis
- Parallel series data and `lineStyle`:
  https://echarts.apache.org/en/option.html#series-parallel
- Series that support `dataset` (radar is not among them):
  https://echarts.apache.org/handbook/en/concepts/dataset
- Grafana Numeric kind: https://grafana.com/developers/dataplane/numeric
- Which ECharts series and components this plugin registers:
  [echarts-coverage.md](./echarts-coverage.md)
