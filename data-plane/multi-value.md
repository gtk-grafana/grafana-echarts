# Multi-value cartesian

Multi-value cartesian charts carry **several aligned numeric dimensions per x
position** instead of the single value of a line or bar:

- **Candlestick** — `[open, close, low, high]` per point
  (https://echarts.apache.org/en/option.html#series-candlestick.data)
- **Boxplot** — `[min, Q1, median, Q3, max]` per point
  (https://echarts.apache.org/en/option.html#series-boxplot.data)

- Converter: `multiValueCartesianToEChartsOption` —
  `src/lib/echarts/converters/multiValueCartesian.ts`
- Chart family: the **cartesian** panel (`seriesType` of `candlestick` or
  `boxplot`)

## Grafana data plane equivalent

There is **no dedicated data plane type** for OHLC or five-number-summary data.
A candlestick frame is structurally a **`TimeSeriesWide`** frame (a time field
plus several numeric fields), and a categorical boxplot is structurally the
**Numeric** kind. See https://grafana.com/developers/dataplane/timeseries and
https://grafana.com/developers/dataplane/numeric.

The converter selects the source frame with `findCategoricalFrame` (the first
frame with a numeric field), so it shares the [categorical model](./categorical.md)'s
single-frame limitation, but it maps fields by **name convention** rather than
turning every numeric field into its own series.

## How a frame is read

Fields are resolved by a case-insensitive name convention:

| Series      | Field names (in ECharts value order) | Fallback                            |
| ----------- | ------------------------------------ | ----------------------------------- |
| candlestick | `open`, `high`, `low`, `close`       | none — missing any field → `null`   |
| boxplot     | `min`, `q1`, `median`, `q3`, `max`   | first five numeric fields, in order |

- Each row becomes one item: the aligned dimension array
  (`field.values[row] ?? null` per field).
- The whole frame is a **single series**, named from `frame.name` (falling back
  to `"OHLC"` / `"Boxplot"`), colored from the `close` / `median` field.
- Before mapping, non-string/non-numeric fields are stripped
  (`filterNonStringOrNumericFields`).

### X axis (categories)

The chart draws on a **category** x-axis (one category per rendered row):

- **With a time field**, each row is labelled by its timestamp (ISO string) and
  rows outside the dashboard `timeRange` are dropped, so the panel tracks the
  time window (matching Grafana's native candlestick).
- **Without a time field** (e.g. a categorical boxplot), the shared
  string/row-index [categories](./categorical.md) are used and every row is kept.

## Divergences from the data plane spec

- **Single frame only.** Only the first frame with a numeric field is used;
  additional frames are not merged (see `todo/multiple-frames.md`).
- **Name-convention field mapping.** Candlestick requires `open`/`high`/`low`/
  `close` fields (returns `null` if any is missing). Boxplot has no Grafana-native
  convention, so it uses `min`/`q1`/`median`/`q3`/`max` names or otherwise the
  first five numeric fields — a plugin convention, not a spec.
- **Category axis, not a continuous time axis.** Even for time-based candlesticks
  the x-axis is categorical; time-range tracking is emulated by dropping
  out-of-range rows rather than pinning the axis extent.
- **Timezone-naive labels.** Timestamps are formatted as ISO strings at convert
  time; timezone-aware rendering is a separate render-step concern.
- Bullish/bearish (candlestick) styling is not derived from the data; a single
  fallback color is used.

Returns `null` when no usable multi-value data can be derived, so callers can
fall back to a no-data view.
