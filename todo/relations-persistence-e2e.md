# Relations persistence — the e2e gap

Node-position and view persistence (`lib/components/hooks/useRelationsPersistence.ts`)
is covered by unit tests at both ends and was verified by hand in a browser, but the one
thing neither can assert is the **round trip through a saved dashboard**. That needs
`@grafana/plugin-e2e`.

## What is covered today

| claim                                                                       | where                                       |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| a graph drag writes `custom.fixedX`/`fixedY` for the dragged node           | `useRelationsPersistence.test.ts`           |
| the displacement is used, not the drop pointer                              | same                                        |
| **every** rendered node's position is written, not only the dragged one     | same                                        |
| a node with no coordinate is skipped rather than defaulted to the origin    | same                                        |
| a mark no field answers to is written anyway                                | same                                        |
| a sankey drag writes its `localX`/`localY` fraction, and only that node     | same                                        |
| a roam writes `relationsViewZoom` / `relationsViewCenter`, only when asked  | same                                        |
| the override is one `byName` rule per mark and replaces an earlier position | `seriesConfig.test.ts`                      |
| a position is read back by name for a mark with no field                    | `seriesConfig.test.ts`, `relations.test.ts` |
| the stored position is read back onto the item                              | `graph.test.ts`, `sankey.test.ts`           |
| dragging is refused under force and circular, however the option was saved  | `graph.test.ts`, `interaction.test.ts`      |
| the seed ring is pixel-ish, so an axis-aligned edge is not nudged off it    | `graph.test.ts`                             |
| a dragged node stays put across a data refresh (sankey **and** graph)       | measured in a browser, 2026-08-07           |
| a drag moves only the node dragged, edges still attached                    | measured in a browser, 2026-08-07           |
| a zoomed view survives an option rebuild                                    | measured in a browser, 2026-08-07           |

The browser measurements were made against a scratch dashboard with a wide nodes+edges
response drawn twice (sankey and fixed-layout graph): the dragged node's painted centroid
was unchanged across a **counted** refresh — one `/api/ds/query` request, so the option was
genuinely rebuilt from the response rather than left holding ECharts' own mutation. The
graph's recorded layout coordinates confirmed the untouched nodes kept their exact
positions.

## What e2e should add

1. **Drag, save, reload.** Drag a node, save the dashboard, reload the page, assert the
   node is where it was left — i.e. that the overrides reached the persisted dashboard
   JSON and not only the in-memory scene.
2. **Pan/zoom, save, reload**, same shape, with `Remember view` on. Plus the negative:
   with it off, the view resets on reload and the dashboard is _not_ marked dirty.
3. **Clearing.** Delete the overrides in the Overrides tab and confirm the nodes return
   to their seeded ring positions, so the write is reversible through the ordinary UI.
4. **Both hosts.** With and without `grafana.panelPluginTransformations`, an edges-only
   response should remember a drag either way — via the pre-pass's field on one host and
   via the by-name read on the other. Only an e2e run can put the two side by side.
5. **The N-overrides cost.** A first drag on a large topology writes one override per
   node. Worth an assertion on the count, and a look at what the Overrides tab does with
   fifty of them.
