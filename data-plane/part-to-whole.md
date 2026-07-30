# Part-to-whole

The part-to-whole model reduces a query response to a flat list of **slices** —
one name / value / color triple per slice — shared verbatim by the render, the
Grafana DOM legend, and the tooltip so all three agree on the same set.

- Model: `PieSliceModel` — `src/lib/echarts/converters/types.ts`
- Converter: `resolvePieSlices` — `src/lib/echarts/converters/pie.ts`
- Chart family: **pie** and **funnel**, both built from the same slices by one
  module (`partToWholeChartModule`, an alias of `pieChartModule`) —
  `src/lib/echarts/charts/pie.ts`. Mirrors the
  [hierarchy family](./hierarchy.md)'s treemap / sunburst pairing.
- Panel: `src/modules/part-to-whole/module.tsx` (the `seriesType` radio picks the
  render variant). `gauge` is a planned third variant and is **not implemented**
  — see [ECharts data specification](#gauge-not-implemented) below.

> **This is the only genuinely multi-frame model in the plugin.** Every other
> member of the [categorical model](./categorical.md) reads the _first_ frame
> with a numeric field and drops the rest. Part-to-whole does not use
> `frameToCategorical` at all: it delegates the whole reduction to Grafana's own
> `getFieldDisplayValues` (the engine behind core's Stat / Gauge / Pie chart
> panels), which walks **every** frame. A one-frame-per-series response
> (Prometheus, the time series "Multi" format) therefore yields one slice per
> series, and `todo/multiple-frames.md` does not apply here.

## Grafana data plane equivalent

This model consumes the **Numeric** kind — a Prometheus instant vector or a
SQL-like table of string and number columns. See
https://grafana.com/developers/dataplane/numeric.

The plugin does **not** branch on `frame.meta.type` when rendering. Any frame
with a field the reduce matcher accepts contributes slices, so `NumericWide`,
`NumericMulti`, and `NumericLong` all flow through the same path — as does a
`TimeSeries*` frame, whose numeric fields are simply reduced (the time field is
ignored, and only ever contributes to the row name in All values mode). The
declared type _is_ read for suggestions and the `Auto` series type; see
[Detection](#detection).

## How a frame is read

`resolvePieSlices` passes the frames straight to `getFieldDisplayValues` and maps
each returned `FieldDisplay` to one `PieSliceModel`. What becomes a slice depends
on `reduceOptions.values`:

| Grafana input                             | Calculate (`values: false`)                           | All values (`values: true`)                                 |
| ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Each matched `number` field (every frame) | One slice, reduced to a single value by `calcs[0]`    | One slice **per row** of that field                         |
| `string` fields                           | Not slices — they only feed the field display name    | Joined into the row name (`getSmartDisplayNameForRow`)      |
| `time` fields                             | Ignored (the numeric matcher rejects them)            | Ignored                                                     |
| Field config (`unit`, `decimals`)         | Carried on `PieSliceModel.field` for value formatting | Same                                                        |
| Field color scheme                        | `display.color`, else the classic palette by position | Same (core also honours a row-name `byName` color override) |
| `displayName` / labels                    | The slice name via `getFieldDisplayName`              | Overrides the row name when set                             |

Slice fields, in order:

- **`name`** — the reduced field's display name (Calculate) or the row name (All
  values). Empty string when core supplies no title.
- **`value`** — `display.numeric`, kept only when finite; a non-finite reduction
  (empty field, all nulls under a mean/last) becomes `undefined`, not `0`.
- **`color`** — a fixed-color override wins (resolved through
  `theme.visualization.getColorByName`, since a Grafana token such as `dark-red`
  is not a CSS color), else the display processor's color, else
  `getPaletteColorByIndex` by slice position.
- **`hidden`** — read by name from `fieldConfig` via `getHiddenSeriesNames` /
  `isSeriesHiddenByName` (`src/lib/grafana/fields/seriesConfig.ts`). Slices are
  not Grafana fields, so the override engine cannot target them; the converter
  applies the `hideSeriesFrom` and `byName` color overrides itself.
- **`field`** — a synthetic single-value numeric field carrying the slice value
  plus the source field's config, so the legend's calc columns resolve.

Overrides match on the display name **or**, as an alias, on the raw source field
name — but only when that raw name identifies exactly one slice. In All values
mode every row shares the value field's name, so the alias is suppressed and only
the row name matches.

The whole result is memoized per `series` array reference (`sliceModelCache`, a
`WeakMap`), because the option, legend, and tooltip paths each resolve slices
with identical inputs within one render.

### The `reduceOptions` contract

The panel registers Grafana's standard Value options
(`addStandardDataReduceOptions`, `src/lib/grafana/editor/common/standardReducer.ts`)
and `normalizePieReduceOptions` normalizes them before the reduction:

| Key      | Behaviour                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `calcs`  | **Truncated to one entry.** A slice is one value, so extra calcs would emit duplicate slices. Defaults to `PIE_CALC_DEFAULT` |
| `values` | `false` = Calculate (one slice per numeric field, across all frames); `true` = All values (one slice per row)                |
| `limit`  | Passed through. Only caps All-values rows; Grafana's own default is `DEFAULT_FIELD_DISPLAY_VALUES_LIMIT` (25)                |
| `fields` | Passed through. Empty = the numeric matcher; set = a **`byRegexp`** matcher instead                                          |

`PIE_CALC_DEFAULT` is `ReducerID.sum` (`src/editor/pie.ts`) — a share of a total,
unlike core Stat / Gauge which default to `lastNotNull`.

### Sorting

`comparePieSlicesByValue` orders the full slice set — hidden slices included, so
toggling a slice off never reshuffles the rest:

- `undefined` (non-finite) values always sort **last**, in either direction.
- `desc` is largest-first, `asc` smallest-first, `none` leaves data order.
- `Array.sort` is stable, so equal values keep their relative order.

The converter's own parameter default is `none`, but the panel always passes
`PIE_SORT_DEFAULT` (`desc`), matching core's Pie chart "Slice sorting".

## Detection

Nothing routes a frame here automatically at render time; the panel is chosen by
the user or suggested. `scorePartToWhole` (`src/lib/echarts/charts/fitness.ts`) is
the suggestion gate:

- No `number` field, or no data → no score at all.
- The data must be a **snapshot shape**: a `NumericWide` / `NumericMulti` /
  `NumericLong` frame, instant (single-timestamp) data, or a frame with no `time`
  field at all. Multi-point time series is excluded, because a slice is a single
  value per category.
- The slice count must land in `[SLICE_MIN, SLICE_MAX]` (2–30, the same ceiling
  core piechart applies). One slice is always 100%, and past 30 the arcs are
  slivers. `resolvePartToWholeSlices` decides what the slices are: a lone numeric
  field is read one slice per **row** (up to `ALL_VALUES_MAX_ROWS`), since reducing
  one field yields a single 100% slice; anything else reduces per field.
- Exactly one string column plus one numeric column scores `Best` — core
  piechart's own shape. Everything else that passes scores `Good`.

The third snapshot branch is load-bearing and was missing for a long time.
`PanelDataSummaryImpl` only assigns `isInstant` while walking a `time` field, so a
SQL/TestData category table — no time column, no `meta.type`, i.e. the canonical
pie source — leaves it `undefined`, and the older `isNumericFrame || isInstant`
gate dropped it.

`partToWholeSuggestionsSupplier` (`src/modules/part-to-whole/suggestions.ts`)
turns the score into Pie / Donut / Funnel cards, each carrying the `reduceOptions`
the resolved slice mode implies. `resolveAutoSeriesType`
(`src/lib/echarts/charts/autoSeriesType.ts`) resolves the family's `Auto` series
type to `pie` independently — it does not consult `fitness.ts`.

## Example

**Long format was removed** from this model — there is no `[category, value]`
long-frame path. Long-shaped data is reshaped upstream with a Grafana transform,
demonstrated side by side with core's Pie chart in
`provisioning/dashboards/part-to-whole/pie-long-transforms.json`:

| Panel                                   | Transforms (`id`)                       | Reduce                      |
| --------------------------------------- | --------------------------------------- | --------------------------- |
| ECharts pie — long via Rows to fields   | `convertFieldType`, then `rowsToFields` | Calculate, `calcs: ['sum']` |
| ECharts pie — long via Group by (sum)   | `convertFieldType`, then `groupBy`      | All values                  |
| Core piechart — long via Rows to fields | `convertFieldType`, then `rowsToFields` | Calculate, `calcs: ['sum']` |

`rowsToFields` maps the `category` column to `field.name` and the `value` column
to `field.value`, producing one numeric field per category — which Calculate then
reduces to one slice each. `groupBy` instead groups on `category` and aggregates
`value` with `sum`, producing one **row** per category — read with All values.

Both start with a `convertFieldType` transform because the CSV `value` column
arrives as text and the reduce matcher is numeric-only. Note the direction:
convert **string → number**. Grafana's `convertFieldType` with a `string`
destination wraps an already-string value in literal quotes, so it must not be
used to "normalize" the name column.

## ECharts data specification

Pinned to **ECharts 6.1.0** (`package.json`; symbols below are from that
version's `echarts/types/src/chart/**` declarations and `echarts/lib/chart/**`
sources). The plugin never uses `dataset` / `encode`: every series is built with
an explicit `series.data` array from the slice model.

For a numeric dimension, `undefined`, `null`, `''`, and the documented empty
token `'-'` all parse to `NaN` (`parseDataValue`,
`echarts/lib/data/helper/dataValueHelper.js`), which is what an `undefined` slice
value becomes.

### Pie

```
series.data: (number | '-' | (number | '-')[] | PieDataItemOption)[]
PieDataItemOption: { id?, name?, value?, selected?, cursor?,
                     itemStyle?, label?, labelLine?, emphasis?, select?, blur? }
```

Sibling inputs that matter for the data read: none. Pie has **no `sort`
option** — the string `sort` appears nowhere in `PieSeriesOption` or in
`echarts/lib/chart/pie/**` — so **render order is data order**. That is exactly
why `resolvePieSlices` sorts the model itself; the chart, legend, and tooltip all
consume the already-ordered array.

The plugin emits `{ name, value, itemStyle, label?, emphasis? }` per slice
(`EChartPieDataItem`, `src/lib/echarts/charts/types.ts`). ECharts exposes its own
`percent` on the callback params, but the plugin ignores it and computes shares
with `formatPieShare` over `getPieSliceTotal(visible)`, so labels, legend, and
tooltip agree and format through Grafana's `percent` value formatter.

**Can a flat Grafana frame supply this?** Yes, directly: one string column and
one numeric column is already a list of `{name, value}` items. Pie's
`getInitialData` uses `makeSeriesEncodeForNameBased`, so it is also
dataset-capable in principle — unused here.

### Funnel

```
series.data: (number | '-' | (number | '-')[] | FunnelDataItemOption)[]
FunnelDataItemOption: { id?, name?, value?, selected?,
                        itemStyle?: ItemStyleOption & { width?, height? },
                        label?, labelLine?, emphasis? }
```

`itemStyle.width` / `itemStyle.height` are real per-item options, but they are
_layout_, not value: they set the trapezoid's extent along the stacking axis
(`height` for a vertical funnel, `width` for a horizontal one), defaulting to an
equal share of the box (`funnelLayout.js`). Value drives the **cross-axis**
width only.

Sibling inputs, all series-level: `min` / `max` map value → size via
`linearMap(value, [min, max], [minSize, maxSize])`, and `sort` reorders items.
`sort` defaults to `'descending'`; `min` defaults to `Math.min(dataExtent[0], 0)`
and `max` to `dataExtent[1]`.

This plugin pins two of them in `getFunnelSeries`
(`src/lib/echarts/options/funnel.ts`):

- `sort: 'none'` — preserve the resolver's order, which already honours the
  shared "Slice sorting" option, instead of letting ECharts re-sort.
- `min: 0` — force a zero baseline so trapezoid width stays proportional to
  value. For all-positive data this equals the ECharts default; it matters when a
  slice value is negative, where the default would rebase the smallest slice to
  zero width and destroy the part-to-whole read.

`orient` / `funnelAlign` / `gap` / `minSize` / `maxSize` are exposed as options
and each omitted at its ECharts default.

**Can a flat Grafana frame supply this?** Yes — identical to the pie; the funnel
render is a pure re-projection of the same slices.

### Gauge (not implemented)

Spec only. Nothing builds a gauge series today: `'gauge'` exists in the
`SeriesType` union (`src/editor/types.ts`) and is deliberately unregistered —
`src/lib/echarts/charts/registry.test.ts` asserts `resolveChartModule('gauge')`
throws ("gauge is a planned part-to-whole variant, not yet registered"), and
`src/lib/echarts/axes/converters.test.ts` asserts `panelTypeToAxis` throws for it
(it is rejected by the `supportedChartSeriesTypes` guard at the top of
`panelTypeToAxis`; note the test's own name says the opposite of what it
asserts).

```
series.data: (number | '-' | GaugeDataItemOption)[]
GaugeDataItemOption: { name?, value?, pointer?, progress?,
                       title?, detail?, itemStyle?, emphasis? }
```

Note there is no array form — a gauge data item is a scalar or an object.

**Multiple pointers = multiple data items.** `GaugeView` iterates the series data
and creates one pointer (and one progress arc, title, and detail) per item; the
item's `name` is what the per-item `title` renders.

Sibling inputs (all on the **option**, never in the data):

| Option                            | Role                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `min` / `max`                     | Value extent. Angle is `linearMap(value, [min, max], [startAngle, endAngle])`  |
| `startAngle` / `endAngle`         | Arc extent in degrees                                                          |
| `splitNumber`                     | Tick count between `min` and `max`                                             |
| `axisLine.lineStyle.color`        | An array of `[stopFraction, color]` pairs (`GaugeColorStop`), fractions `0..1` |
| `radius` / `center`               | Layout                                                                         |
| `pointer` / `progress` / `anchor` | Pointer, progress arc, and hub rendering                                       |
| `title` / `detail`                | Series-level defaults for the per-item name / value readouts                   |

**Fit verdict: excellent.** A gauge is the pie reduce model with a single slice.
`PieSliceModel` already carries everything needed: `value`, the source field's
config (`unit`, `decimals`) for `detail.formatter`, `name` for `title`, and a
resolved `color`. Grafana's `min` / `max` field config maps onto the series
`min` / `max`, and thresholds map directly onto `axisLine.lineStyle.color` —
each threshold step becomes a `[stopFraction, color]` pair, with the fraction
being the step value normalized into `[min, max]`.

Caveats: with more than one data item every per-item `title` / `detail` is drawn
at the same `offsetCenter` unless each item sets its own, so a multi-pointer
gauge needs manual placement. Whether `dataset` works for a gauge is
**unverified**: `getInitialData` calls `createSeriesDataSimply(this, ['value'])`,
which does read `seriesModel.getSource()` (the dataset-aware path), but passing
`opt` as an array skips the `encodeDefine` branch, and this was not exercised at
runtime.

## Divergences from the data plane spec

- **`NumericLong` is not pivoted.** The spec's long form (dimension columns plus
  a value column) is not read as dimensions; a long frame's string column is
  never turned into slice identity by the converter. Users reshape upstream (see
  [Example](#example)). The one place a string column reaches a slice name is
  All values mode, where core joins the row's string values into the row name.
- **Only the first calc is honoured.** `reduceOptions.calcs` is truncated to one
  entry; a multi-calc reduce configured elsewhere in the panel JSON silently
  loses its extras.
- **Numeric fields only.** The default matcher is numeric, so a value column that
  arrives as text (`"12.5"`) contributes nothing until a **Convert field type**
  transform makes it a number. Setting `reduceOptions.fields` swaps the matcher
  for a regexp one, which will happily match a string field — whose reduction is
  then non-finite, i.e. a slice with no value.
- **Silent truncation.** All values mode caps at `reduceOptions.limit`, or 25
  when unset, with no indication that rows were dropped.
- **No caps on slice count.** In Calculate mode a very wide response becomes a
  very crowded pie; only ECharts' `minAngle` / `minShowLabelAngle` mitigate it.
- **Hidden slices still count for sorting** (they are ordered with the rest), but
  not for totals: percentage shares use the visible slices only
  (`getPieSliceTotal` is called with the filtered set), so a pie with a slice
  toggled off re-normalizes to 100%.
- **Slice visibility and color are applied by the converter**, not by Grafana's
  override engine — slices are rows of a reduction, not fields, so `byName`
  matching is re-implemented against the display name and the raw field name.

`resolvePieSlices` returns an **empty array** when no frame yields a numeric
slice (the synthetic "No data" `FieldDisplay` core emits is filtered out by its
missing `colIndex`), and `buildOption` turns that into `null` so the panel falls
back to a no-data view.

## References

- Grafana data plane, Numeric kind: https://grafana.com/developers/dataplane/numeric
- ECharts `series-pie`: https://echarts.apache.org/en/option.html#series-pie
- ECharts `series-funnel`: https://echarts.apache.org/en/option.html#series-funnel
- ECharts `series-gauge`: https://echarts.apache.org/en/option.html#series-gauge
- Core Pie chart option parity: `src/modules/part-to-whole/parity.md`
- Family coverage overview: [echarts-coverage.md](./echarts-coverage.md)
- Shared frame reading for the other non-time charts:
  [categorical.md](./categorical.md)
