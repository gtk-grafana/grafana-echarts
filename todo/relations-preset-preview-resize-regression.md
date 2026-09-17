# Relations preset preview recalculates during editor resize

## Status

The force-layout preset preview moves when the panel editor changes width. The movement causes a large performance cost.

Two fixes passed automated tests but did not stop the problem in the live Grafana editor. Do not use these tests as proof of the fix.

## Required behavior

A preset preview must keep its first layout when the editor width changes. It must calculate a new layout only when its data changes.

The Time network slider must continue to change the selected time in its preview. Normal dashboard panels must continue to respond to size changes.

## Existing resize controls

The preview configuration sets `isPreview: true` in `src/lib/echarts/charts/suggestionCards.ts`.

`src/lib/echarts/relations/chartModule.ts` returns the `fixed` resize strategy for a force-layout preview. `src/lib/components/EChart.tsx` also disables `useChartResize` for previews.

`src/lib/components/hooks/useSettledChartSize.ts` keeps the first size for the `fixed` strategy. The existing unit tests cover each control in isolation.

These controls do not prevent the live movement. The next investigation must use the mounted preset card in Grafana.

## Failed attempt 1: suppress ECharts option work

This attempt changed `useChartOption` and the Relations resize strategy.

The hook stored the first preview build input. It ignored changes to size and equivalent configuration objects. It allowed a new build for new frame identities and a new selected timeline stop.

The Relations module also returned `fixed` before data conversion for all preview variants. New hook and chart-module unit tests passed.

The full result was green:

```text
Test Suites: 147 passed, 147 total
Tests:       2 skipped, 2316 passed, 2318 total
Snapshots:   175 passed, 175 total
```

The user examined the live editor and reported that the force preview still moved. The attempt operated after the React render began. It did not prove whether Grafana remounted the card or whether ECharts changed layout outside `useChartOption`.

The attempt was fully reverted. The focused rollback tests passed with 72 tests and no snapshots.

Do not retry a ref gate inside `useChartOption`. Do not treat isolated resize-strategy tests as a reproduction of this problem.

## Failed attempt 2: memoize the panel component

This attempt remains in the working tree at handoff.

`src/lib/components/Panel.tsx` wraps the exported panel with `React.memo`. Its comparator ignores preview width and equivalent wrapper changes when these data values stay equal:

- Loading state.
- Structure revision.
- Query request ID.
- Singular and plural query errors.
- Data time range identity.
- Frame count and frame identities.

The test mirrors Grafana card behavior. Grafana creates a new `PanelData` wrapper and calls `data.series.slice(...)` for each card render. The test recreates those wrappers while it changes width and preview configuration identity.

The tests also prove that a new frame identity makes the preview render again. A normal dashboard panel still receives a new width.

The full result was green:

```text
Test Suites: 147 passed, 147 total
Tests:       2 skipped, 2311 passed, 2313 total
Snapshots:   175 passed, 175 total
```

The user examined the live editor and reported that the force preview still moved. The test mocks `EChart`, so it cannot detect ECharts remounts, `setOption` calls, `resize` calls, or force-node movement.

React context updates can also update descendants of a memoized component. Grafana can also replace a card with a new React key. Either case bypasses this comparator.

Do not accept the current component test as proof of the fix. Revert the two-file memoization patch before the final implementation unless it becomes necessary after the live cause is known.

## Required reproduction

Use the existing Grafana process on `http://127.0.0.1:3000`. Do not restart it unless the user asks.

Open the provisioned dashboard with UID `echarts-relations-presets`. Edit a Relations panel and open Presets. Watch the Service topology card while the configuration pane changes width.

Collect this evidence during one width change:

1. Count mounts and disposals of the ECharts instance in `EChart.tsx`.
2. Count calls to `chart.setOption` and `chart.resize` for the Service topology preview.
3. Record the React key or DOM identity of the card and chart container.
4. Capture node positions before and after the width change.
5. Capture browser console errors, page errors, and HTTP responses with status 400 or more.

The result must identify which operation moves the nodes. A test must reproduce that operation with the real mounted `EChart` component.

## Likely paths to examine

- Grafana can unmount and mount `VisualizationSuggestionCard` when the editor grid changes.
- `VizLayout` can update its internal layout through context or measurement without a new `Panel` render.
- ECharts or zrender can react to a DOM size change without `useChartResize`.
- A new chart instance can calculate the force layout even when the resize strategy is `fixed`.
- The preview can receive new frame objects during each Grafana card render.

Do not select a fix until the browser trace identifies the active path.

## Acceptance test

Add a mounted integration test that uses the real `EChart` and force graph. It must reproduce the same parent or DOM change as the live editor.

The test must prove these facts:

- The preview keeps the same ECharts instance.
- The preview does not call `setOption` or `resize` because of an editor width change.
- The force-node positions do not change.
- New frame data updates the preview.
- A selected Time network stop updates the preview.
- A normal dashboard panel still responds to size changes.

Do not change a `*.canvas.test.*` snapshot.
