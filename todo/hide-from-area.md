# "Hide in area" (`custom.hideFrom`) gaps

## Problem

The legend visibility + color work registered `commonOptionsBuilder.addHideFrom`
in all four modules (cartesian, part-to-whole, multivariate, heatmap) so the
legend show/hide toggle's `byName` `custom.hideFrom` override is applied by
Grafana's field-override engine. Registering it also adds the standard **Hide in
area** field-config switch (three toggles: **viz**, **legend**, **tooltip**) to
each editor. Two parts of that switch's advertised behavior are **not**
implemented.

## Gap 1 — only the `viz` sub-toggle is honored

The plugin reads `custom.hideFrom.viz` only:

- `isFieldHiddenFromViz` (`src/lib/grafana/fields/fieldConfig.ts`) checks
  `custom.hideFrom.viz`.
- `getHiddenSeriesNames` (`src/lib/grafana/fields/seriesConfig.ts`) matches
  `hideFrom.viz` on `byName` overrides.

Nothing consumes `hideFrom.legend` or `hideFrom.tooltip`. Core Grafana panels
honor all three (hide from the graph, drop from the legend, drop from the
tooltip) independently. Here:

- **Hide in legend** has no effect — the series stays in the DOM legend (greyed
  only when `viz` is set).
- **Hide in tooltip** has no effect — the tooltip formatter is keyed off the
  frames/series, not `hideFrom.tooltip`.

So two of the three switches the editor now shows are inert, which is misleading.

## Gap 2 — the "Hide in area" switch is a footgun for pie (row/series families)

For per-field families (cartesian/radar/heatmap overlay) the switch works for
`viz`: `stripHiddenValueFields` (called once in
`src/lib/echarts/options/panelOption.ts`) drops the numeric field.

For **pie** (part-to-whole) slices are _rows of a single value field_, so:

- Per-slice hiding correctly flows through the legend click → a `byName`
  override matching the **category name**, read directly by the converter
  (`src/lib/echarts/converters/pie.ts` via `getHiddenSeriesNames`).
- But the editor **Hide in area > viz** switch targets the underlying **value
  field**, which `stripHiddenValueFields` then removes — blanking the whole pie
  (no numeric field left) rather than hiding one slice.

Candlestick/boxplot are the other row/series family but are not editor-selectable
today, so the switch is not reachable there.

## Why it's not fixed yet

- Honoring `hideFrom.legend`/`hideFrom.tooltip` means threading the flag into the
  legend-item builders (skip vs. grey) and the tooltip formatter, and deciding
  whether the DOM legend or the render path owns each decision.
- The pie footgun is inherent to registering a _field_-level switch for a
  _row_-level visual. Options include hiding the standard switch for the pie
  module, or documenting it as unsupported for pie.
- `addHideFrom` was registered primarily so the legend toggle's override applies;
  the editor switch is a side effect, so its partial behavior was accepted for the
  first pass.

## Proposal / open questions

- Decide per sub-toggle:
  - **viz** — keep (implemented for per-field families).
  - **legend** — either implement (skip the item in the legend builders in
    `src/lib/echarts/options/legendItems.ts`) or drop the toggle.
  - **tooltip** — either implement (skip the row in the tooltip formatter) or drop
    the toggle.
- For pie: can a standard field-config switch be hidden per module (e.g. via
  `disableStandardOptions` / `standardOptions` on the builder) without also
  losing the override round-trip the legend toggle relies on? If not, document
  "Hide in area" as viz-only and pie-unsupported in the module editor help.
- Add a regression test/provisioned case that exercises `hideFrom.legend` /
  `hideFrom.tooltip` once behavior is decided.
