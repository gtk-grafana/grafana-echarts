# Relations no-data view for invalid frames

## Status

This document is an implementation plan. The work has not started.

## Scope

A no-data view is Grafana's centered message for unusable panel data.

This task applies only to the Relations panel family:

- Graph.
- Sankey.
- Chord.

Other panel families keep their current behavior.

The task covers frames that the Relations panel cannot render. It also covers a valid graph when field configuration hides every mark.

The task does not add support for the proposed `graph-wide` metadata. The shipped compatibility behavior remains the source of truth.

The proposed specification supplies useful invalid cases. It does not override the current reader behavior.

Do not reject remainder fields or duplicate field names when the current reader can render them. This task tests renderability, not strict contract compliance.

References:

- [Shipped graph-wide behavior](../data-plane/graph-wide.md).
- [Proposed graph-wide specification](../data-plane/graph-wide-proposed.md).
- [Grafana data plane contract](https://grafana.com/developers/dataplane/).

## Current behavior

`src/lib/components/Panel.tsx` shows `PanelDataErrorView` only when every frame is empty. A non-empty unsupported frame continues into the chart path.

`frameToRelationsGraph` returns `null` when it cannot find graph edges. It throws when legacy row frames reach an unsupported host.

`buildPanelChartOption` returns `null` when the chart module returns no option. `useChartOption` then clears the ECharts canvas.

The cleared canvas leaves a blank panel. The user gets no cause and no next action.

The temporary dashboard demonstrates these cases:

- A random-walk time series produces a blank Relations panel.
- A flame graph frame produces a blank Relations panel.
- The core Time series panel explains that the frame lacks a time field.
- A query error reaches Grafana's existing `No data` view.

Dashboard: [Invalid graph frames](http://localhost:3010/d/gcq22d/invalid-graph-frames?orgId=1&from=now-6h&to=now&timezone=browser).

## Target behavior

If `data.state` is not loading, the Relations panel must show one of these results:

- A rendered chart.
- A Grafana no-data view with an actionable message.
- Grafana's existing query error view.

The Relations panel must not show an empty canvas in these states.

If `data.state` is loading, keep the current loading behavior. Do not replace it with a frame error.

If the response has no frames or only empty frames, keep Grafana's default `No data` message.

If the response contains a query error, keep Grafana's query error behavior. A frame message must not hide the query error.

## Design

### Return a read result

Replace the nullable Relations read with a result that contains data or a reason code.

Add the result near `frameToRelationsGraph` in `src/lib/echarts/relations/converters/nodeGraph.ts`. Keep the reader independent from React and Grafana UI components.

Use one result shape for graph, Sankey, and chord. Cache the full result in the existing weak cache.

The result must distinguish these reasons:

- The response has no supported graph shape.
- The response declares nodes but has no edges.
- A declared edges frame has no edge with usable endpoints.
- Legacy row frames reached the panel without conversion.
- Field configuration hides every renderable mark.

Keep empty responses in the existing panel-level path. They do not need a Relations reason code.

### Preserve role rules

Use `resolveGraphWideRoles` and the current endpoint rules. Do not create a second role detector.

Preserve these compatibility rules:

- `graph-edges-wide` forces the edges role.
- `graph-nodes-wide` prevents the edges role.
- Endpoint labels or `-->` can identify undeclared edges.
- A declared edges frame takes priority over shape matches.
- Non-graph frames remain remainder data.

Identify the failure after role selection. This order prevents a generic message from hiding a more useful cause.

### Detect the visible result

Move the visible graph helper out of the private chart-module scope. Reuse it for the render and the no-data decision.

Apply hidden-node and hidden-edge configuration before the decision. If no node or edge can render, return the hidden-marks reason.

Do not treat an isolated visible node as empty when ECharts can draw it. The result must match the selected graph variant.

### Add a chart-module data issue

Add an optional data-issue resolver to `ChartModule` in `src/lib/echarts/charts/types.ts`. Only the Relations module implements it in this task.

The resolver must return a stable reason code and the user message. A successful render returns no issue.

Call the resolver after the Relations chart context is complete. Call it before the ECharts component mounts.

Split `PanelContent` if the early return conflicts with React hook order. Keep chart-only hooks in the successful-render component.

Render `PanelDataErrorView` with these properties:

- The original `PanelData` object.
- The panel ID.
- The field configuration.
- The actionable message.

Do not throw for a known frame shape problem. Reserve thrown errors for unexpected implementation failures.

Keep the generic `null` handling in `useChartOption` for other chart families. The Relations path must resolve its known failures before this hook runs.

## Message plan

Each message must state the problem and the user action.

### Unsupported frame shape

Use this message:

> Graph data is missing edges. Add source and target labels to each numeric edge field.

Use this reason for ordinary time series, flame graph frames, and other unrelated non-empty frames.

### Nodes without edges

Use this message:

> Graph data contains nodes but no edges. Add an edges frame.

Use this reason when metadata identifies a nodes frame and no edges frame exists.

### Edges without endpoints

Use this message:

> Graph edge fields are missing endpoints. Add source and target labels to each numeric edge field.

Use this reason when a declared edges frame contains no readable edge.

The message also applies when declared custom endpoint keys do not match any field labels.

### Legacy row data

Use this message:

> Row-based Node Graph data was not converted. Add a Rows to fields transformation, or enable panel system transformations in Grafana.

Keep the current Grafana version guidance if it remains correct during implementation.

### Hidden marks

Use this message:

> All graph marks are hidden. Show at least one node or edge in the field configuration.

Use this reason only after a graph was read successfully.

## Implementation steps

1. Add the Relations read-result types and reason codes.
2. Update `frameToRelationsGraph` to return the full result.
3. Reuse the result in the Relations chart module.
4. Expose the visible graph calculation for the renderability decision.
5. Add the optional chart-module data-issue resolver.
6. Render `PanelDataErrorView` before the ECharts component mounts.
7. Keep empty, loading, and query-error behavior unchanged.
8. Update comments that describe `null` or thrown errors as user feedback.
9. Commit this plan document before implementation starts.
10. After that commit exists, delete this file and remove its `todo/README.md` entry.
11. Include the deletion in the next implementation commit.

Git history remains the source for this plan after its deletion.

## Unit tests

Update `src/lib/echarts/relations/converters/nodeGraph.test.ts` with one case for each reason code.

Cover these frame sets:

- A normal time series.
- A flame graph frame.
- A declared nodes-only response.
- A declared edges frame without endpoints.
- A declared custom endpoint pair that does not match field labels.
- Unconverted legacy row frames.
- A valid edges-only graph.
- A valid nodes-and-edges graph.

Update `src/lib/echarts/relations/chartModule.test.ts` with renderability cases. Run each failure through graph, Sankey, and chord when variant behavior differs.

Update `src/lib/components/Panel.test.tsx` to record the `PanelDataErrorView` message. Test these states:

- Loading with unsupported frames does not show a frame error.
- Done with unsupported frames shows the actionable message.
- Done with empty frames keeps `No data`.
- A query error keeps the Grafana error behavior.
- A valid graph mounts the chart content.
- A graph with all marks hidden shows the hidden-marks message.

Do not add assertions to a `*.canvas.test.*` file. Do not update canvas snapshots.

## Provisioned dashboard

Add `provisioning/dashboards/relations/invalid-graph-frames.json`. Use the temporary dashboard as the starting point.

Include these panels:

- A random-walk time series in the Relations panel.
- A flame graph frame in the Relations panel.
- The same flame graph frame in the core Time series panel.
- A declared nodes-only response.
- A declared edges response without endpoints.
- A valid graph with every mark hidden.
- A successful empty response.
- A query-error control.
- A valid graph control.

Include graph, Sankey, and chord coverage for the shared invalid-frame behavior. Keep each panel title explicit about its expected message.

## Validation

Run the focused unit tests first:

```sh
pnpm exec jest --runInBand src/lib/echarts/relations/converters/nodeGraph.test.ts src/lib/echarts/relations/chartModule.test.ts src/lib/components/Panel.test.tsx
```

Run the project checks after the focused tests pass:

```sh
pnpm run checks
pnpm run build
```

Open the provisioned dashboard in the existing Grafana instance. Do not restart the instance unless the user asks.

For each panel, collect browser console errors, page errors, and HTTP responses with status 400 or higher. Capture and inspect a full dashboard image.

Make sure that every non-loading Relations panel shows a chart or a message. No panel can contain an empty canvas.

Inspect these existing dashboards for regressions:

- `provisioning/dashboards/relations/graph-wide.json`.
- `provisioning/dashboards/relations/node-graph-testdata.json`.
- `provisioning/dashboards/relations/sankey.json`.
- `provisioning/dashboards/relations/chord.json`.

Ask the user to inspect the same dashboards before the task closes.

## Acceptance criteria

The implementation is complete when all these statements are true:

- A non-loading Relations panel never renders an empty canvas.
- Unsupported non-empty frames show an actionable reason.
- Nodes-only data shows the missing-edges reason.
- Declared edges without endpoints show the endpoint reason.
- Unconverted row data shows the transformation reason.
- Fully hidden graph data shows the hidden-marks reason.
- Empty responses keep Grafana's default `No data` view.
- Query errors keep Grafana's existing error behavior.
- Loading does not show a frame error.
- Graph, Sankey, and chord share the same behavior.
- Other ECharts panel families keep their current behavior.
- The provisioned dashboard demonstrates each new state.
- Existing Relations dashboards still render.
- No canvas snapshot changes are present.
- Git history contains this plan document.
- The final repository tree does not contain this plan or its index entry.
