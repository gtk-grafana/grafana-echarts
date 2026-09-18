For more information see [Provision dashboards and data sources](https://grafana.com/tutorials/provision-dashboards-and-data-sources/)
Don't forget to use dashboards v1 format as this repo hasn't set up v2 provisioning yet

Use the local directory (`provisioning/dashboards/local`) to add dashboards that you don't want to commit to the repo.

## Relations-only server

Run `pnpm run server:relations` to build one standalone Relations panel and start
Grafana on port 4001. Set `GRAFANA_PORT` and `GRAFANA_CONTAINER_NAME` to run it
beside another local stack.

This stack provisions only the TestData datasource and dashboards from the
`relations/` directory. It does not enable the app plugin or provision dashboards
for the other panel families.

This command tests the production build. It does not watch source files. Stop the
stack and run `pnpm run server:relations` again after each source change.

The standalone build replaces `dist` with the Relations panel artifact. Do not
restart `server` or `server:lgtm` with this artifact. Those stacks provision the
`grafana-echarts-app` app plugin. Run `pnpm run build` before you return to either
full stack.

The provider recurses (`foldersFromFilesStructure: true`), so each subdirectory of
`dashboards/` becomes a Grafana folder. Committed dashboards are backed by the
**TestData DB** datasource (uid `trlxrdZVk`), so they work without any external
data source. All are hand-authored **except `tooltip-showcase.json`** — see below.

## `tooltip-showcase.json` — generated, do not hand-edit

The tooltip showcase is built by
[`scripts/build-tooltip-showcase.py`](../scripts/build-tooltip-showcase.py); its
two-dozen near-identical panels are generated so they stay consistent. Edit the
script and regenerate, or your change is lost the next time anyone runs it:

```sh
python3 scripts/build-tooltip-showcase.py
```

The script formats its output through Prettier (which governs `provisioning/**`),
so the regenerated file passes `pnpm run lint` as-is.

It covers the React `VizTooltip` overlay across every chart family: proximity
hover, All-mode row emphasis, click-to-pin, and the pinned footer's data links —
each family resolves a hovered item back to a source field + row differently, so
each gets its own panel with a data link attached.

## `relations/` — graph / sankey / chord

Demonstrates the ECharts **Relations** panel (`grafana-echarts-relations-panel`) across
its three render variants, all on one node/link converter. Every dashboard here is
TestData-backed so it needs no external data source; the live-data equivalents are under
[../lgtm/provisioning/dashboards/lgtm-relations/](../lgtm/provisioning/dashboards/lgtm-relations/).

Grafana updates these provisioned dashboards in place by UID. A non-provisioned dashboard
that uses the old panel type cannot load after this ID change. Replace the old `type` in
the exported dashboard JSON and import it again, or recreate the panel.

Grouped roughly: the **contract** fixtures (`node-graph-testdata`, `graph-wide`,
`node-graph-sql-expressions`, `derived-nodes`), the **variant** showcases (`sankey`,
`chord`, `timeline`, `fixed-layout`), the **option** showcases (`all-options`,
`readability`, `per-mark-tooltip-links`) and the **standard-options** showcases
(`value-mappings`, `colour-domain`). The dashboards are maintained as JSON fixtures.

- **`node-graph-testdata.json`** — all five TestData `node_graph` sub-types, one panel
  each. Three are deliberate regression fixtures: `random` (which **generates cycles**,
  the case that makes ECharts' sankey throw in production), `random edges` (an
  **edges-only** response, which is legal input), and `feature_showcase` (`arc__*` and
  `icon`, neither of which has a native ECharts equivalent).
- **`node-graph-sql-expressions.json`** — reshaping a flat call table into the
  nodes + edges frame pair with two **SQL Expressions**, kept TestData-backed so it
  needs no external data source. Demonstrates why node-graph detection has to key on
  field shape: the reshaped frames are named `B`/`C` by refId and carry no frame
  metadata. Requires the `sqlExpressions` feature toggle (GA, on by default).
- **`derived-nodes.json`** — an **edges-only** response, where every node exists only
  because an edge named it, and per-node `byName` overrides landing on nodes that appear
  in no frame the datasource returned. Needs the panel-registered transformations API
  ([#129992](https://github.com/grafana/grafana/pull/129992)) with
  `grafana.panelPluginTransformations` on; without it the graphs still draw and the
  overrides go inert except hiding, which the panel re-reads by name. Background:
  [../docs/relations-derived-nodes.md](../docs/relations-derived-nodes.md).
- **`value-mappings.json`** — what Grafana's standard **Value mappings** option does
  here, one use case per panel: mapped text in the tooltip row and the node value label,
  a mapping's `color` recolouring the mark, per-mark targeting via `byName`, and the
  counter-example — a null-matching mapping that fires and is still never shown, which is
  why the "No value" standard option is unregistered for this family.
- **`all-options.json`** — the **reference**: one panel per panel option **that visibly
  changes what the panel draws** (31 of them), in the order the options pane lists them,
  each setting exactly one option away from its default and describing what to look at.
  Every panel was checked in a browser against the same panel at that option's default, so
  none of them silently demos nothing. Linked option-by-option from
  [../src/modules/relations/parity.md](../src/modules/relations/parity.md) and pinned by
  `allOptionsDashboard.test.ts`, which asserts the demoed set plus an explicit
  `NO_VISUAL` list partitions the registered options — so a new option fails the build
  until someone writes its panel or states why it has none.

  The eight excused ones have nothing a still picture could show: `editorMode` changes the
  pane rather than the panel; `Animate layout` and `Animation` are motion and settle to an
  identical render; `Pan`, `Remember view` and `Draggable nodes` draw nothing until you
  interact; `Highlight adjacency` and `Tooltip mode` act on hover.

- **`colour-domain.json`** — the evidence for keeping `min` / `max` / **Field min/max**
  registered, since no relations code reads them directly and they therefore look inert.
  They are not: Grafana turns them into `field.state.range`, the domain a **percentage**
  threshold grades against. Same data and steps on every panel; only the domain differs.
  Named as the verification fixture by
  [../todo/relations-conditional-field-config.md](../todo/relations-conditional-field-config.md).

Which real data sources can produce this shape, and the Prometheus/Loki/SQL recipes,
are in [../docs/relations-data-sources.md](../docs/relations-data-sources.md).

## `part-to-whole/` — pie demos

Demonstrates the ECharts **Part-to-whole** (pie) panel, which reduces data with
Grafana's standard **Value options** (`reduceOptions`: Calculate / All values,
Calculation, Limit, Fields) via `getFieldDisplayValues`. The native wide/long
"Format" radio was removed; long-shaped data is reshaped to wide upstream with a
transform.

- **`pie-parity.json`** — core `piechart` panels beside ECharts part-to-whole
  panels over the **same multi-series** TestData (`random_walk`, `seriesCount: 5`),
  with matching `reduceOptions`, legend, and tooltip. Each series is one slice —
  the multi-series case the reduce-options rewrite unlocks.
- **`pie-long-transforms.json`** — long-shaped TestData (`csv_content`, a category
  column + a value column) reshaped to a pie via **Rows to fields** (→ wide, one
  slice per Calculate) and **Group by** (sum per category, → one slice per All
  values), with a core `piechart` reference. This is the documented replacement
  for the removed `long` format.
- **`pie-labels.json`** — the "Labels" option (Grafana Pie chart parity): eight
  panels over the same data, one per combination of the Name / Value / Percent
  slice-label content.
- **`pie-sort.json`** — the "Slice sorting" option (Grafana Pie chart parity):
  Descending / Ascending / None over the same data, with Name + Value labels so
  the slice order is visible.

The `legend-visibility-color.json` pie panel is converted the same way: a Rows to
fields transform reshapes its long CSV to wide, and it keeps its byName-color
(`Sales` → purple) and hidden-slice (`Ops`) overrides using only `reduceOptions`
(no `pieFormat`/`pieCalc`).
