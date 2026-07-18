For more information see [Provision dashboards and data sources](https://grafana.com/tutorials/provision-dashboards-and-data-sources/)
Don't forget to use dashboards v1 format as this repo hasn't set up v2 provisioning yet

Use the local directory (`provisioning/dashboards/local`) to add dashboards that you don't want to commit to the repo.

The provider recurses (`foldersFromFilesStructure: true`), so each subdirectory of
`dashboards/` becomes a Grafana folder. All committed dashboards are hand-authored
and backed by the **TestData DB** datasource (uid `trlxrdZVk`), so they work
without any external data source.

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

The `legend-visibility-color.json` pie panel is converted the same way: a Rows to
fields transform reshapes its long CSV to wide, and it keeps its byName-color
(`Sales` → purple) and hidden-slice (`Ops`) overrides using only `reduceOptions`
(no `pieFormat`/`pieCalc`).
