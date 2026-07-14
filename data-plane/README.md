# Data plane

How this plugin reads Grafana **data frames** and maps them onto ECharts. These
docs describe the _current_ behavior of the converters in
`src/lib/echarts/converters/` and note where it diverges from the official
Grafana data plane contract: https://grafana.com/developers/dataplane/.

Grafana consolidates every query response into column-oriented **data frames**
(fields + metadata). The data plane adds a _type_ (`frame.meta.type`) declaring
the frame's kind (time series, numeric, heatmap, ...). This plugin only branches
on `meta.type` for the heatmap family; every other chart infers its shape from
the fields present.

## Models

| Doc                                      | ECharts charts                               | Grafana kind consumed                           |
| ---------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| [categorical.md](./categorical.md)       | pie, radar, category-axis line/bar/scatter   | Numeric (`NumericWide`/`Multi`/`Long`)          |
| [multi-value.md](./multi-value.md)       | candlestick, boxplot                         | TimeSeriesWide / Numeric (by name convention)   |
| [heatmap-binned.md](./heatmap-binned.md) | continuous-axis heatmap (custom cell series) | Heatmap (`heatmap-rows` / `heatmap-cells`)      |
| [heatmap-matrix.md](./heatmap-matrix.md) | category x category heatmap (native series)  | Numeric (wide / pivot) — _not_ the Heatmap kind |
| [node-graph.md](./node-graph.md)         | _spec only, not implemented_                 | Node graph (out of contract — nodes + edges)    |

Time series (line/bar/scatter on a `time` axis) is the straightforward
`[time, value]` mapping in `src/lib/echarts/converters/timeSeries.ts` and is not
given its own doc here.

## Conventions shared across models

- **Positional alignment.** Frames are assumed square: `field.values[row]` lines
  up across all fields, and the frame length matches the value length.
- **Colors** come from each field's standard Color scheme config.
- **Series names** come from `getFieldDisplayName` (which folds in field labels).
- Converters return `null` (or throw, for category cartesian) when no usable
  data can be derived, so callers can fall back to a no-data view.

## Known limitations

The biggest cross-cutting gap is **single-frame handling**: the categorical,
multi-value, and matrix-heatmap models read only the first frame with a numeric
field and drop the rest, so multi-frame responses (`*Multi`, one-frame-per-series
datasources like Prometheus) are not merged. See `todo/multiple-frames.md`.
