# Part-to-whole (pie) editor option parity

Compares the ECharts **Part-to-whole** module ([module.tsx](./module.tsx)),
rendering `seriesType: pie`, against core Grafana's **Pie chart** panel
([
`public/app/plugins/panel/piechart/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/piechart/module.tsx)).

## Design difference

Core Pie chart adds data-reduction options (which value/calculation per slice)
plus pie-specific display options (type, sorting, labels, legend values). This
module now shares core's data-reduction model: it registers the standard **Value
options** (`addStandardDataReduceOptions`) and resolves slices through Grafana's
`getFieldDisplayValues` (see `resolvePieSlices`), so reduction, multi-frame
handling, display name, color, and unit/decimals formatting are all owned by
Grafana. Multiple series/frames (e.g. one frame per Prometheus series) each become
a slice. Pie-specific _display_ options (type, sorting, labels, legend values) are
all supported.

Long-shaped data is reshaped to wide upstream with a Grafana transform (**Rows to fields** or **Group
by**) — see the `provisioning/dashboards/part-to-whole/` demos.

## Coverage columns

Every table below carries two columns that track _proof_ rather than implementation —
"was it built" (Status) versus "is it shown to work":

- **Regression test** — the automated test that pins the behaviour. `canvas:` names a
  case in the [canvas snapshot suite][canvas] (the recorded draw calls); `unit:` names
  an option-mapping, converter or tooltip-model test. "needs e2e" marks an option a
  canvas snapshot _cannot_ prove — the Grafana DOM legend, hover and click
  interaction, the editor wiring itself — which needs a
  [`@grafana/plugin-e2e`](../../../tests/panel.spec.ts) test instead; none of those are
  written yet. `—` means no coverage of any kind.
- **Demo panel** — the provisioned dashboard panel that exercises the option: the first
  link is the committed JSON, the second the same panel in a running Grafana. Live
  links assume `docker compose up` on the default `GRAFANA_PORT`
  (`http://localhost:3001`) with the plugin built into `dist/`. `—` means no
  provisioned panel moves this option off its default.

Both columns describe what exists **today** — the gaps are a to-do list, not a claim
that the option is broken.

## Panel options

| Core Grafana option                               | ECharts equivalent                                                                                                                     | Status          | Regression test                                                                                                                                                                                         | Demo panel                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Value / calculation (data reduce)                 | `reduceOptions` (Calculate/All values + Calculation) via `addStandardDataReduceOptions`                                                | Supported       | [canvas: Calculate sum / mean][canvas], [unit: resolvePieSlices][pie-conv]                                                                                                                              | [pie-parity.json][db-parity] · [#2 live][live-parity-2]              |
| Fields to include, limit                          | `reduceOptions.fields` / `reduceOptions.limit`                                                                                         | Supported       | [canvas: All values with limit][canvas], [unit: caps the slices at the configured limit][pie-conv]                                                                                                      | —                                                                    |
| Pie chart type (Pie / Donut)                      | `pieType` radio in a "Pie" category; rendered as the series radius by `getPieRadius`                                                   | Supported       | [canvas: donut (inner hole)][canvas], [unit: getPieRadius][pie-opts]                                                                                                                                    | [pie-parity.json][db-parity] · [#4 live][live-parity-4]              |
| Slice sorting (asc/desc/none)                     | `sort` select in the default (top) section, shared by pie + funnel; orders the shared slice model in `resolvePieSlices` (default desc) | Supported       | [canvas: ascending (smallest first)][canvas], [unit: slice sorting][pie-conv]                                                                                                                           | [pie-sort.json][db-sort] · [#2 live][live-sort-2]                    |
| Labels (Percent / Name / Value)                   | `displayLabels` multi-select in a "Labels" category; rendered by `getPieContentLabel`                                                  | Supported       | [canvas: name + value + percent labels][canvas], [unit: getPieContentLabel][pie-opts]                                                                                                                   | [pie-labels.json][db-labels] · [#8 live][live-labels-8]              |
| Arc start / end angle (ECharts-only)              | `startAngle` / `endAngle` number inputs in the "Pie" category (Advanced); half-pie / semicircle donut via `getPieAngles`               | Advanced        | [canvas: half-pie, semicircle donut][canvas], [unit: getPieAngles][pie-opts]                                                                                                                            | [pie-angles.json][db-angles] · [#2 live][live-angles-2]              |
| Label font size (ECharts-only)                    | `labelFontSize` number input ("Labels", Advanced); threads into `getPieLabelStyle`                                                     | Advanced        | [canvas: enlarged slice labels][canvas], [unit: getPieLabelStyle][pie-opts]                                                                                                                             | [pie-legibility.json][db-legib] · [#1 live][live-legib-1]            |
| Label overflow / width (ECharts-only)             | `labelOverflow` select + `labelWidth` ("Labels", Advanced); `label.overflow`/`label.width` via `getPieLabelStyle`                      | Advanced        | [canvas: truncated long labels][canvas], [unit: getPieLabelStyle][pie-opts]                                                                                                                             | [pie-legibility.json][db-legib] · [#2 live][live-legib-2]            |
| Min angle to show label (ECharts-only)            | `minShowLabelAngle` number input ("Labels", Advanced); `series.minShowLabelAngle` via `getPieMinShowLabelAngle`                        | Advanced        | [canvas: hides labels on tiny slices][canvas], [unit: getPieMinShowLabelAngle][pie-opts]                                                                                                                | —                                                                    |
| Slice separation border (ECharts-only)            | `sliceBorderWidth` + `sliceBorderColor` (color picker) ("Pie", Advanced); `itemStyle` border via `getPieItemStyle`                     | Advanced        | [canvas: bordered slices][canvas], [unit: getPieItemStyle (slice separation border)][pie-opts]                                                                                                          | [pie-legibility.json][db-legib] · [#1 live][live-legib-1]            |
| Custom radius / center (ECharts-only)             | `outerRadius`/`innerRadius`/`centerX`/`centerY` ("Pie", Advanced); `radius`/`center` via `getPieRadius`/`getPieCenter`                 | Advanced        | [canvas: custom inner/outer radius and center][canvas], [unit: getPieRadius / getPieCenter][pie-opts]                                                                                                   | [pie-legibility.json][db-legib] · [#3 live][live-legib-3]            |
| Tooltip: mode                                     | `tooltip.mode`                                                                                                                         | Supported       | [unit: buildPieTooltipModel — Single / All][pie-tip]; the hover itself needs e2e                                                                                                                        | [tooltip-showcase.json][db-tip] · [#17 live][live-tip-17]            |
| Tooltip: hide zeros                               | `tooltip.hideZeros` via `addTooltipOptions`; drops zero-value slices from the "All" tooltip                                            | Supported       | [unit: drops zero-value slices when hideZeros is set][pie-tip]                                                                                                                                          | —                                                                    |
| Tooltip: click-to-pin, data links, ad-hoc filters | React `VizTooltip` footer for the hovered slice's field (annotations: todo)                                                            | Supported       | [unit: resolves a pie slice back to its source row][tip-links] (a click-to-pin + data-link render through jsdom); the re-pin path is only covered for the hierarchy family, and ad-hoc filters need e2e | [tooltip-showcase.json][db-tip] · [#17 live][live-tip-17]            |
| Tooltip: sort                                     | none                                                                                                                                   | Not supported\* | n/a                                                                                                                                                                                                     | n/a                                                                  |
| Legend: visibility, mode, placement, width        | Grafana legend via `addLegendOptions` (reducer "Values" stats-picker dropped)                                                          | Supported       | [unit: useLegend — placement, display mode, hidden][use-legend]; the rendered DOM legend needs e2e                                                                                                      | [pie-parity.json][db-parity] · [#4 live][live-parity-4]              |
| Legend: slice show/hide + color (interactive)     | Per-slice toggle; converter reads the `hideSeriesFrom` (visibility) and `byName` (color) overrides by name                             | Supported       | [canvas: byName fixed-color override][canvas], [unit: byName parity][pie-conv], [unit: hides just the clicked item][use-legend]; the click path needs e2e                                               | [legend-visibility-color.json][db-legvis] · [#2 live][live-legvis-2] |
| Legend values (Percent / Value)                   | `legend.values` multi-select in the "Legend" category; rendered by `buildPieLegendItems`                                               | Supported       | [unit: buildPieLegendItems][legend-items]; the rendered columns need e2e                                                                                                                                | —                                                                    |

\* Tooltip sort in eCharts uses existing slice sorting instead of having two separate options.

## Advanced pie options (ECharts-only)

Gated behind the shared **Advanced** editor mode (`showIf: isAdvancedEditorMode`);
hidden in Default. Each omits its ECharts key at the default so existing renders
are unchanged.

| ECharts option / option group          | ECharts equivalent                                                                                 | Status   | Regression test                                                                                                                       | Demo panel                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Rose type (Nightingale)                | `roseType` (Pie category, Radius / Area); rendered by `getPieRoseType`                             | Advanced | [canvas: radius, area][canvas], [unit: getPieRoseType][pie-opts]                                                                      | [pie-rose-type.json][db-rose] · [#2 live][live-rose-2]              |
| Min slice angle                        | `minAngle` (Pie category, degrees); rendered by `getPieMinAngle`                                   | Advanced | [canvas: enlarges tiny long-tail slices][canvas], [unit: getPieMinAngle][pie-opts]                                                    | [pie-min-angle.json][db-minangle] · [#2 live][live-minangle-2]      |
| Label position                         | `labelPosition` → `label.position` (Outside / Inside / Center); threaded into `getPieContentLabel` | Advanced | [canvas: inside, center on a donut][canvas], [unit: getPieContentLabel — threads the inside / center position][pie-opts]              | [pie-label-position.json][db-labelpos] · [#2 live][live-labelpos-2] |
| Center value (donut readout)           | `centerValueReducer` (shown only with center labels); drives the donut-center `title`              | Advanced | [canvas: center on a donut without a reducer][canvas], [unit: getPieCenterTitle, getPieCenterEmphasisLabel][pie-opts]                 | [pie-label-position.json][db-labelpos] · [#3 live][live-labelpos-3] |
| Select / explode                       | `selectedMode` + `selectedOffset` (Pie category); rendered by `getPieSelection`                    | Advanced | [canvas: single selection with an explode offset][canvas], [unit: getPieSelection][pie-opts]                                          | [pie-interactivity.json][db-inter] · [#1 live][live-inter-1]        |
| Rounded corners                        | `itemStyle.borderRadius` (Pie category); rendered by `getPieBorderRadius` / `getPieItemStyle`      | Advanced | [canvas: slice border radius][canvas], [unit: getPieBorderRadius][pie-opts]                                                           | [pie-interactivity.json][db-inter] · [#1 live][live-inter-1]        |
| Emphasis (hover)                       | `emphasis.focus` + `emphasis.scale` (Pie category); rendered by `getPieEmphasis`                   | Advanced | [unit: getPieEmphasis][pie-opts]; the hover state itself needs e2e                                                                    | [pie-interactivity.json][db-inter] · [#2 live][live-inter-2]        |
| Label color                            | `label.color` (Labels category, `addColorPicker`); overrides the theme color in `getPieLabelStyle` | Advanced | [canvas: name labels tinted with a custom color][canvas], [unit: resolvePieLabelColor][pie-opts]                                      | —                                                                   |
| Zero-sum / empty circle                | `stillShowZeroSum` + `showEmptyCircle` (Pie category); rendered by `getPieEmptyState`              | Advanced | [canvas: show empty circle on a zero-sum frame][canvas], [unit: getPieEmptyState][pie-opts]                                           | [pie-interactivity.json][db-inter] · [#3 live][live-inter-3]        |
| Clockwise / avoid label overlap        | `clockwise` + `avoidLabelOverlap` (Pie category); rendered by `getPieOrientation`                  | Advanced | [canvas: counter-clockwise slice order][canvas], [unit: getPieOrientation][pie-opts]                                                  | [pie-interactivity.json][db-inter] · [#3 live][live-inter-3]        |
| Animation + label text shadow / stroke | `animation.enabled` (Pie) + `label.textShadowBlur` / `label.textBorderWidth` re-enable (Labels)    | Advanced | [canvas: text shadow on visible labels][canvas], [unit: applyPartToWholeEditorModeDefaults][pie-opts]; the animation itself needs e2e | —                                                                   |

## Standard (field-config) options

| Option         | Core Pie                                     | ECharts Part-to-whole                     | Regression test                                                                                                                      | Demo panel                                                                                                     |
| -------------- | -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Color scheme   | Kept (bySeries, gradient, seeded fixedColor) | Kept (PaletteClassic, byValue + bySeries) | [canvas: byName fixed-color override, by-value color scheme][canvas], [unit: byName parity][pie-conv]                                | [legend-visibility-color.json][db-legvis] · [#2 live][live-legvis-2]                                           |
| Thresholds     | Disabled                                     | Kept                                      | —                                                                                                                                    | —                                                                                                              |
| Unit           | Kept                                         | Kept                                      | —                                                                                                                                    | —                                                                                                              |
| Decimals       | Kept                                         | Kept                                      | [unit: formatPieShare honors the provided decimals][pie-conv] (percent labels only)                                                  | —                                                                                                              |
| Min            | Kept                                         | Kept (bounds the by-value color domain)   | —                                                                                                                                    | —                                                                                                              |
| Max            | Kept                                         | Kept (bounds the by-value color domain)   | —                                                                                                                                    | —                                                                                                              |
| Display name   | Kept                                         | Kept (names the slice)                    | [unit: still matches by display name when that is what the override targets][pie-conv] (indirect — override matching, not the label) | —                                                                                                              |
| No value       | Kept                                         | Kept                                      | [unit: reduces an all-null field][pie-conv], [unit: keeps null-valued slices even when hideZeros is set][pie-tip]                    | —                                                                                                              |
| Value mappings | Kept                                         | Kept                                      | —                                                                                                                                    | —                                                                                                              |
| Data links     | Kept                                         | Kept (pinned-tooltip footer)              | [unit: resolves a pie slice back to its source row][tip-links]                                                                       | [tooltip-showcase.json][db-tip] · [#17 live][live-tip-17], [funnel.json][db-funnel] · [#5 live][live-funnel-5] |

## Notes / gaps

- Slice labels (Name / Value / Percent) are supported via the "Labels" option,
  donut rendering via the "Pie" > Pie chart type option, slice sorting via the
  "Pie" > Slice sorting option, and legend values (Percent / Value) via the
  "Legend" > Legend values option.
- ECharts-only roadmap: this module's family also covers the funnel render type —
  implemented, with its own canvas snapshots
  ([part-to-whole-funnel.canvas.test.tsx][canvas-funnel]) and demo
  ([funnel.json][db-funnel]), though its options are not yet broken out into a table
  here — and gauge, which is not yet implemented.
- Editor options are tiered via the shared `editorMode` option (Default =
  parity-only, Advanced = ECharts extras, API = JSON-only). The core-parity pie
  options (type, sorting, labels, legend, reduce options) are Default. ECharts-only
  extras are gated behind Advanced (`showIf: isAdvancedEditorMode`, each omitted at
  its default): **Rose type** (Nightingale: Radius / Area, `roseType` via
  `getPieRoseType`), **Min slice angle** (`minAngle`, degrees, via `getPieMinAngle`,
  enlarges tiny long-tail slices so they stay visible/clickable), **Start angle** /
  **End angle** (`startAngle` / `endAngle` via `getPieAngles`, enabling half-pie /
  semicircle-donut layouts), **Label position** (`labelPosition` →
  `label.position`: Outside / Inside / Center), the legibility options — **Label
  font size**, **Label overflow/width**, **Min-angle-to-show-label**, **Slice
  separation border**, and **Custom radius/center** — and the interactivity/polish
  options — **select/explode**, **rounded corners**, **emphasis**, **label color**,
  **zero-sum/empty**, **clockwise/avoid-overlap**, and **animation + label text
  shadow/stroke**. See [docs/options-modes.md](../../../docs/options-modes.md) and
  the `pie-legibility.json` demo.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                                              | Status          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (pie)                                                                                           | Partial         | `seriesType: pie`; slice labels (Name/Value/Percent) via `label`; label placement (Outside/Inside/Center) via `label.position` (Advanced `labelPosition`); pie/donut via `radius`; sorting via the resolver; rose (Nightingale) type (Radius/Area) via `roseType` (Advanced); min slice angle via `minAngle` (Advanced); arc range via `startAngle`/`endAngle` (Advanced). Advanced also adds `label.fontSize`/`overflow`/`width`, `minShowLabelAngle`, `itemStyle` border, custom `radius`/`center`, `selectedMode`/`selectedOffset`, `itemStyle.borderRadius`, `emphasis`, `stillShowZeroSum`/`showEmptyCircle`, `clockwise`/`avoidLabelOverlap`, and label color/text-style. |
| `legend`                                                                                                 | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive per-slice show/hide (via `hideSeriesFrom`) + color (via `byName`) read directly by category.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `tooltip`                                                                                                | Supported       | Grafana-styled; mode maps to `trigger` (item / none).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `animation`                                                                                              | Supported       | Off by default (`PIE_ANIMATION_ENABLED_DEFAULT`, now the shared `ANIMATION_ENABLED_DEFAULT`); Advanced opts in via the "Animation" switch (`animation.enabled`), and Default mode resets it through `applyPartToWholeEditorModeDefaults`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `color` / `textStyle`                                                                                    | Supported       | Derived from the Grafana theme.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `grid` / `xAxis` / `yAxis`                                                                               | Not implemented | Pie has no cartesian coordinate system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `visualMap` / `markLine` / `markArea` / `axisPointer` / `brush` / `dataZoom`                             | Not implemented | Cartesian-oriented components; N/A for pie.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                                        | Not implemented | Not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Other coordinate systems (`polar` / `radar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

<!-- Regression test targets -->

[canvas]: ../../lib/components/part-to-whole.canvas.test.tsx
[canvas-funnel]: ../../lib/components/part-to-whole-funnel.canvas.test.tsx
[pie-opts]: ../../lib/echarts/options/pie.test.ts
[pie-conv]: ../../lib/echarts/converters/pie.test.ts
[pie-tip]: ../../lib/echarts/tooltip/pie.test.ts
[legend-items]: ../../lib/echarts/options/legendItems.test.ts
[use-legend]: ../../lib/components/hooks/useLegend.test.tsx
[tip-links]: ../../lib/components/tooltip/dataLinks.test.tsx

<!-- Provisioned dashboards: committed JSON, then the panel in a running Grafana -->

[db-parity]: ../../../provisioning/dashboards/part-to-whole/pie-parity.json
[live-parity-2]: http://localhost:3001/d/e1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f0?viewPanel=2
[live-parity-4]: http://localhost:3001/d/e1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f0?viewPanel=4
[db-sort]: ../../../provisioning/dashboards/part-to-whole/pie-sort.json
[live-sort-2]: http://localhost:3001/d/e4d5e6f7-0819-42a3-b4c5-d6e7f0010203?viewPanel=2
[db-labels]: ../../../provisioning/dashboards/part-to-whole/pie-labels.json
[live-labels-8]: http://localhost:3001/d/e3c4d5e6-f708-4192-a3b4-c5d6e7f00102?viewPanel=8
[db-angles]: ../../../provisioning/dashboards/part-to-whole/pie-angles.json
[live-angles-2]: http://localhost:3001/d/b7c8d9e0-1a2b-43c4-95d6-e7f801020304?viewPanel=2
[db-legib]: ../../../provisioning/dashboards/part-to-whole/pie-legibility.json
[live-legib-1]: http://localhost:3001/d/f5e6f7a8-1920-43b4-c5d6-e7f011223344?viewPanel=1
[live-legib-2]: http://localhost:3001/d/f5e6f7a8-1920-43b4-c5d6-e7f011223344?viewPanel=2
[live-legib-3]: http://localhost:3001/d/f5e6f7a8-1920-43b4-c5d6-e7f011223344?viewPanel=3
[db-rose]: ../../../provisioning/dashboards/part-to-whole/pie-rose-type.json
[live-rose-2]: http://localhost:3001/d/f5e6f708-1920-43b4-c5d6-e7f011121314?viewPanel=2
[db-minangle]: ../../../provisioning/dashboards/part-to-whole/pie-min-angle.json
[live-minangle-2]: http://localhost:3001/d/f5e6f708-192a-43b4-c5d6-e7f001020304?viewPanel=2
[db-labelpos]: ../../../provisioning/dashboards/part-to-whole/pie-label-position.json
[live-labelpos-2]: http://localhost:3001/d/f5e6f708-1920-42a3-b4c5-d6e7f0020304?viewPanel=2
[live-labelpos-3]: http://localhost:3001/d/f5e6f708-1920-42a3-b4c5-d6e7f0020304?viewPanel=3
[db-inter]: ../../../provisioning/dashboards/part-to-whole/pie-interactivity.json
[live-inter-1]: http://localhost:3001/d/b1c2d3e4-1a2b-43c4-95d6-e7f801020310?viewPanel=1
[live-inter-2]: http://localhost:3001/d/b1c2d3e4-1a2b-43c4-95d6-e7f801020310?viewPanel=2
[live-inter-3]: http://localhost:3001/d/b1c2d3e4-1a2b-43c4-95d6-e7f801020310?viewPanel=3
[db-funnel]: ../../../provisioning/dashboards/part-to-whole/funnel.json
[live-funnel-5]: http://localhost:3001/d/f1a2b3c4-0819-42a3-b4c5-d6e7f0020304?viewPanel=5
[db-legvis]: ../../../provisioning/dashboards/legend-visibility-color.json
[live-legvis-2]: http://localhost:3001/d/c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f?viewPanel=2
[db-tip]: ../../../provisioning/dashboards/tooltip-showcase.json
[live-tip-17]: http://localhost:3001/d/echarts-tooltip-showcase?viewPanel=17
