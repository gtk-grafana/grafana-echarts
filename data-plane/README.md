# Data plane

How this plugin reads Grafana **data frames** and maps them onto ECharts. These
docs describe the _current_ behavior of the converters in
`src/lib/echarts/converters/` and note where it diverges from the official
Grafana data plane contract: https://grafana.com/developers/dataplane/.

Grafana consolidates every query response into column-oriented **data frames**
(fields + metadata). The data plane adds a _type_ (`frame.meta.type`) declaring
the frame's kind (time series, numeric, heatmap, ...). This plugin only branches
on `meta.type` for the heatmap family.

The one other routing signal it reads is `meta.preferredVisualisationType`,
which Grafana uses for kinds that sit outside the contract: `isFlameGraphFrame`
(`src/lib/echarts/converters/hierarchy.ts`) accepts
`preferredVisualisationType === 'flamegraph'` as the canonical flame-graph
signal, falling back to the nested-set field shape (`level` + `value` + `label`)
for datasources that cannot set meta. Every other chart infers its shape from
the fields present.

## Models

| Doc                                          | ECharts charts                                            | Grafana kind consumed                                   |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| [categorical.md](./categorical.md)           | category-axis line / bar / scatter (shared base model)    | Numeric (`NumericWide`/`Multi`/`Long`)                  |
| [time-series.md](./time-series.md)           | time-axis line / bar / scatter                            | Time series (`TimeSeriesWide` / `TimeSeriesMulti`)      |
| [stream.md](./stream.md)                     | themeRiver (stacked ribbons on a single time axis)        | Time series, wide/multi **or** long (pivoted)           |
| [stream-sources.md](./stream-sources.md)     | which data sources feed the stream family                 | —                                                       |
| [part-to-whole.md](./part-to-whole.md)       | pie, funnel                                               | Any numeric field, reduced via standard `reduceOptions` |
| [multivariate.md](./multivariate.md)         | radar                                                     | Numeric, through the categorical model                  |
| [multi-value.md](./multi-value.md)           | candlestick, boxplot                                      | TimeSeriesWide / Numeric (by name convention)           |
| [hierarchy.md](./hierarchy.md)               | treemap, sunburst                                         | Flame-graph nested set, or Numeric (flat fallback)      |
| [flame-graph.md](./flame-graph.md)           | input frame format for treemap / sunburst                 | Flame graph (out of contract — nested set)              |
| [heatmap-binned.md](./heatmap-binned.md)     | continuous-axis heatmap (custom cell series)              | Heatmap (`heatmap-rows` / `heatmap-cells`)              |
| [heatmap-matrix.md](./heatmap-matrix.md)     | category x category heatmap (native series)               | Numeric (wide / pivot) — _not_ the Heatmap kind         |
| [node-graph.md](./node-graph.md)             | _spec only, not implemented_                              | Node graph (out of contract — nodes + edges)            |
| [echarts-coverage.md](./echarts-coverage.md) | every ECharts series type — implementation support matrix | —                                                       |

## Conventions shared across models

- **Positional alignment.** Frames are assumed square: `field.values[row]` lines
  up across all fields, and the frame length matches the value length.
- **Colors** come from each field's standard Color scheme config.
- **Series names** come from `getFieldDisplayName` (which folds in field labels).
- Converters return `null` (or throw, for category cartesian) when no usable
  data can be derived, so callers can fall back to a no-data view.

## Known limitations

The biggest cross-cutting gap is **single-frame handling**: the categorical,
multi-value, matrix-heatmap, and hierarchy models read a single source frame and
drop the rest, so multi-frame responses (`*Multi`, one-frame-per-series
datasources like Prometheus) are not merged. They pick it with
`findCategoricalFrame` (`src/lib/echarts/converters/frames.ts`), the first frame
with a numeric field; hierarchy's flame-graph path likewise takes the first
flame-graph frame. See `todo/multiple-frames.md`.

Four models are genuine exceptions and do read every frame:

- **Part-to-whole** (pie, funnel) delegates to Grafana's own
  `getFieldDisplayValues` (`resolvePieSlices` in
  `src/lib/echarts/converters/pie.ts`), which reduces numeric fields across all
  frames, so a one-frame-per-series response yields one slice per series.
- **Binned heatmap** merges every heatmap frame into one cell set
  (`frameToBinnedHeatmap`, `src/lib/echarts/converters/binnedHeatmap.ts`). The
  x-axis stays a `time` axis only when every contributing frame has a time X
  field.
- **Time series** walks the numeric fields of every frame that has a usable time
  (or fallback numeric) X field (`forEachTimeSeriesField`,
  `src/lib/echarts/converters/frames.ts`).
- **Stream** (themeRiver) uses that same walk for its wide/multi path, and merges
  the layers pivoted out of any long-shaped frames alongside them
  (`frameToStream`, `src/lib/echarts/converters/stream.ts`). It is also the only
  model that **pivots a long frame** — one layer per value of a label column —
  which the models above explicitly do not do.
