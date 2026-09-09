For more information see [Provision dashboards and data sources](https://grafana.com/tutorials/provision-dashboards-and-data-sources/)
Don't forget to use dashboards v1 format as this repo hasn't set up v2 provisioning yet

Use the local directory (`provisioning/dashboards/local`) to add dashboards that you don't want to commit to the repo.

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

## `relations/` — node graph fixtures (no ECharts panel yet)

Groundwork for the planned **relations** family (ECharts graph / sankey / chord; see
[../todo/node-graph.md](../todo/node-graph.md)). The ECharts panel does not exist yet,
so these render with the **core Node graph panel** — swap the panel type once the
nested panel ships.

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
