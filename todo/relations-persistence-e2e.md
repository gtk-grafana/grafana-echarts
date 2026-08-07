# Relations persistence — the e2e gap

Node-position and view persistence (`lib/components/hooks/useRelationsPersistence.ts`)
is covered by unit tests at both ends and was verified by hand in a browser, but the one
thing neither can assert is the **round trip through a saved dashboard**. That needs
`@grafana/plugin-e2e`.

## What is covered today

| claim                                                                      | where                             |
| -------------------------------------------------------------------------- | --------------------------------- |
| a graph drag writes `custom.fixedX`/`fixedY` for the dragged node          | `useRelationsPersistence.test.ts` |
| the displacement is used, not the drop pointer                             | same                              |
| a sankey drag writes its `localX`/`localY` fraction                        | same                              |
| a roam writes `relationsViewZoom` / `relationsViewCenter`, only when asked | same                              |
| a mark no field answers to is not written at all                           | same                              |
| the override is one `byName` rule and replaces an earlier position         | `seriesConfig.test.ts`            |
| the stored position is read back onto the item                             | `graph.test.ts`, `sankey.test.ts` |
| a dragged node stays put across an option rebuild                          | measured in a browser, 2026-08-07 |
| a zoomed view survives an option rebuild                                   | measured in a browser, 2026-08-07 |

The two browser measurements were made against `d/echarts-relations-fixed-layout`
panel 5 on the dev container: the node's painted centroid was unchanged by a resize
(which rebuilds the whole option from the panel's config), and the painted bounding box
stayed at its zoomed size, 409x357 against 323x323 unzoomed.

## What e2e should add

1. **Drag, save, reload.** Drag a node, save the dashboard, reload the page, assert the
   node is where it was left — i.e. that the override reached the persisted dashboard
   JSON and not only the in-memory scene.
2. **Pan/zoom, save, reload**, same shape, with `Remember view` on. Plus the negative:
   with it off, the view resets on reload and the dashboard is _not_ marked dirty.
3. **Clearing.** Delete the override in the Overrides tab and confirm the node returns
   to its seeded ring position, so the write is reversible through the ordinary UI.
4. **Derived nodes.** On a host with `grafana.panelPluginTransformations`, dragging a
   node the response only implied should persist (the pre-pass made it a field); with
   the flag off it should be a no-op rather than a snap-back. Only an e2e run can put
   the two hosts side by side.

## Known limitation to encode as a test, not fix

Dragging persists **only where the mark is a field**. On a stock host an edges-only
response's nodes are invented inside the panel, so there is nothing for a `byName`
override to land on and `hasFieldNamed` declines the write — the drag stands for the
session and is forgotten on the next data refresh. That is the same boundary as every
other per-node override (`docs/relations-derived-nodes.md`), not a persistence bug.
