# Migrating the relations family onto `graph-*-wide`

> **Status: not started.** The contract is specified and validated in
> [../data-plane/graph-wide.md](../data-plane/graph-wide.md), with a proof dashboard at
> `provisioning/dashboards/relations/graph-wide.json`. Nothing under `src/` has changed.
> This doc is the rewrite plan: what to build, in what order, and — importantly — what
> the rewrite deliberately does **not** carry over.

The contract makes one node one field and one edge one field, so Grafana's own override
engine addresses each mark. That closes, as ordinary field behaviour, most of what the
three relations to-do docs are still arguing about. This plan is the bridge from
"specified" to "shipped", and it starts from an uncomfortable measured fact:

**Feeding the relations panel a wide frame today throws.** `frameToNodeGraph` needs
fields literally named `source` and `target`, finds none, returns `null`, and
`buildOption` raises `Invalid chart option resolved for graph`. The panel renders
"An unexpected error happened". That is the regression target kept as panel 12 of the
proof dashboard, and phase 1 exists to fix it.

## The one asymmetry that shapes everything

An adapter **inside** the panel runs after `applyFieldOverrides`. `data.series` reaches
the chart context post-override (`src/lib/components/Panel.tsx`), so anything the panel
reshapes is reshaped _downstream_ of the override pass. Legacy input can therefore
render perfectly and still never gain per-mark overrides — there is no field for an
override to have landed on when the override pass ran.

This holds however the adapter is implemented, including by calling
`transformDataFrame` with a `rowsToFields` config: the call site is still downstream.

Only a transformation the **user** has placed in the Transform tab runs early enough.
That is why interop is a transformation rather than a panel feature, and why the
capability matrix below has a "closed for wide input only" column at all.

## Phase order

Each phase is independently shippable and independently reviewable.

### Phase 1 — internal model, adapter, and stop throwing

1. Keep `NodeGraphData` (`{ nodes, links }`) as the single internal model. It is already
   chart-agnostic and already what all three variants consume.
2. Add `isGraphWideFrames(frames)` implementing the contract's
   [role resolution](../data-plane/graph-wide.md#frame-role-resolution): `meta.type`
   first, field shape second, panel option third.
3. Add `legacyToWide(frames): DataFrame[]` — see
   [the adapter decision](#the-adapter-decision) — and place it **at the frame
   boundary**, so the converter only ever sees the wide form. One internal model, one
   adapter; deleting legacy later is deleting one function.
4. Make `buildOption` return `null` rather than throw when no graph can be derived, so
   an unreadable response falls back to the no-data view like every other family.

**Exit criterion:** every existing relations dashboard renders unchanged, and the wide
fixture renders instead of erroring.

### Phase 2 — the wide reader

5. `frameToGraphWide(frames, theme): NodeGraphData` — one node per field of the nodes
   frame, one link per field of the edges frame; identity from `field.name`; endpoints
   from labels, else the name split; values from `reduceOptions.calcs[0]` / `[1]`.
6. Register `addStandardDataReduceOptions` for the family and normalize it the way
   part-to-whole does (`normalizePieReduceOptions`, `pie.ts`): truncate `calcs` to two,
   pin `values: false`. Pattern already exists; only the truncation width differs.
7. Carry the owning `Field` on every node and link (not a `sourceRowIndex` into a frame),
   which is what makes phases 3–5 possible at all.

**Exit criterion:** the proof dashboard's wide fixtures render in the relations panel,
and the adjacency-matrix fixture renders as a graph.

### Phase 3 — delete the colour path

8. Colour becomes `field.display(value).color`. `makeRelationsColorResolver`
   (`options/graph.ts`) is **deleted**, along with the `getSeriesColorOverride` call for
   this family. All eight modes work because `applyFieldOverrides` already resolved them
   — measured: a `byName` fixed colour of `dark-red` arrives as `#C4162A` from the
   display processor, with no `getColorByName` call needed downstream.
9. Do the same for edges. `toLinkItems` gains the edge's own field, so the
   "edges have no colour-scheme path at all" gap closes by construction rather than by a
   new resolver.

**Note for hierarchy.** `hierarchy.ts:64-69` has the byte-identical broken guard, and
hierarchy is **not** pivoting in this plan. So
[relations-color-schemes.md](./relations-color-schemes.md) must stay open: its A1/A4
fixes are still needed there. Deleting the relations resolver does not delete the bug.

### Phase 4 — per-mark custom config

10. `useCustomConfig` for `custom.lineWidth`, `.lineType`, `.curveness`, `.hideFrom` on
    edges and `custom.nodeRadius`, `.subtitle`, `.icon`, `.fixedX`, `.fixedY`,
    `.hideFrom` on nodes.
11. Replace `addHiddenSeriesHideFrom` with the real
    `commonOptionsBuilder.addHideFrom` for wide input: a `byName` `custom.hideFrom`
    override now genuinely targets one mark. Verified on core panels — the bar for
    `b->d` simply disappears.
12. Drop the `stripHiddenValueFields` exclusion (`options/panelOption.ts`) for wide
    input, and delete `withoutHiddenNodes`' by-name re-implementation
    (`charts/relations.ts`) with it. **Keep both for legacy input**, where the marks are
    still rows and the exclusion is still load-bearing.

### Phase 5 — tooltip, links and legend

13. Each mark resolves its own `field.display` for tooltip formatting, killing
    "tooltip unit decided by frame order".
14. `config.links` per mark. Gaps 1–3 of
    [relations-data-links.md](./relations-data-links.md) close structurally; gap 4 does
    not (see the matrix).
15. Legend items come from fields, so `getHiddenSeriesNames` / `changeSeriesColorConfig`
    are no longer needed for this family — the legend colour picker writes an ordinary
    `byName` colour override that the override engine applies.

### Phase 6 — docs and provisioning

16. Fold the wide panels of `graph-wide.json` onto the relations panel as they start
    working, keeping the core-panel controls alongside as the "this is standard Grafana"
    reference.
17. Update `src/modules/relations/parity.md`, and resolve the three to-do docs against
    the matrix below.

## The adapter decision

**Decision: option 3 — do not adapt silently. Detect, notify, and render.**

Three options were weighed. The measured facts moved the answer away from the cheap one.

### Hand-rolled — `legacyToWide(frames): DataFrame[]`

A pure synchronous function. More code than delegating, but it drops straight into the
existing synchronous call path and into plain jest tests. It must, per the contract,
emit **id-named fields with `source`/`target` labels** rather than name-split fields,
because that is the only form that survives
[parallel edges](../data-plane/graph-wide.md#parallel-edges-require-labels).

### Delegated — `transformDataFrame([{ id: 'rowsToFields', … }], frames)`

Much less code, and it inherits core's semantics exactly. Three costs, all confirmed:

- **Async.** It returns `Observable<DataFrame[]>`. The converter path is synchronous and
  `buildOption` is called up to four times per render; threading an Observable through it
  is a real architectural change, not a free win.
- **The registry is a host concern — and worse than assumed.** `rowsToFields` is _not
  implemented_ in `@grafana/data` at all: the package ships only the id constant
  (`DataTransformerID.rowsToFields`), while the implementation lives in Grafana core's
  app code (`public/app/features/transformers/rowsToFields/`). Verified both ways: the
  id is in `transformations/transformers/ids.mjs`, no implementation is anywhere in the
  package, and at runtime `standardTransformersRegistry.getIfExists('rowsToFields')`
  does return a live item with a real `transformation`. So it works in the host and is
  **unmockable-by-registration** under jest — the tests would need the whole transformer
  stubbed in `jest-setup.js`.
- **Invisibility.** A panel-invoked transform does not appear in the Transform tab, so a
  user debugging a wrong-looking graph sees data reshaped by something they cannot
  inspect.

### Chosen — detect, notify, render

- **Render** legacy input through a hand-rolled `legacyToWide`, which is all an in-panel
  adapter can ever do well. It is small, synchronous, and testable.
- **Notify** rather than pretend: a corner notice — _"legacy row format: add a **Rows to
  fields** transformation to enable per-node and per-edge overrides"_ — using the
  existing `ChartNotices` surface that already reports sankey's dropped links. This is
  honest about the capability difference, keeps the reshaping visible and editable, and
  needs no adapter at all for the override story.
- **Document the recipe** in `docs/relations-data-sources.md`, which now carries it.

The notice is cheap and it is the only thing that can teach a user the difference,
because the difference is not visible in the render.

## The `dataFormat` panel option

```ts
dataFormat: 'auto' | 'legacy' | 'wide'; // default 'auto'
```

- **`auto`** (default) — role resolution as specified: `meta.type`, then field shape.
  Correct for every fixture and every datasource tested.
- **`legacy`** / **`wide`** — force one reader. The escape hatch for the ambiguous cases
  the contract names: an adjacency matrix whose key column is called `source`
  (`isEdgesFrame` would not claim it, but a future looser shape test might), and a wide
  frame whose ids happen to contain the separator.

**Migration:** none needed. Existing panels have no `dataFormat` key, `auto` resolves
their frames to `legacy` by field shape, and the render is unchanged. Add the key to
`PanelOptions` with a default rather than a `PanelMigrationHandler` — there is no old
value to translate. If a later phase changes the _default_ reader, that is when a
migration handler earns its place.

## Capability matrix

Three verdicts:

- **Closed** — standard field behaviour under the wide contract, no plugin code.
- **Wide only** — closed for wide input; legacy input keeps the legacy limit, because an
  in-panel adapter runs after `applyFieldOverrides`.
- **Open** — the contract does not close it, with the reason.

### Every row of the "what this buys" argument

| Documented problem                                                     | Where                                                   | Verdict            | Note                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Only 2 of 8 colour modes reach the chart                               | `relations-color-schemes.md`; `options/graph.ts:91-124` | **Wide only**      | Colour becomes `field.display(value).color`; the resolver is deleted for this family. **Hierarchy still needs the fix.** |
| Edges have no colour-scheme path at all                                | `toLinkItems` takes no `ctx` (`graph.ts`)               | **Wide only**      | An edge is a field, so it has a display processor                                                                        |
| A `byName` fixed colour is not theme-resolved                          | `fields/seriesConfig.ts:116-127`                        | **Closed**         | `applyFieldOverrides` resolves it upstream (measured: `dark-red` → `#C4162A`). Pie and hierarchy still route round it    |
| `field.state.range` contaminated by `noderadius` / `arc__*` / `fixedx` | `relations-color-schemes.md`                            | **Wide only**      | Measured: legacy `{min: 0.5, max: 60}` vs wide `{min: 8, max: 12}`                                                       |
| A link on `mainstat` paints on **every** node                          | `relations-data-links.md` gap 1                         | **Wide only**      | Demonstrated on the proof dashboard: one link, one node                                                                  |
| Only `mainstat` consulted for links; edges usually unreachable         | gap 2                                                   | **Wide only**      | Each mark carries its own field                                                                                          |
| A node can be handed the **edges** frame's field                       | gap 3                                                   | **Wide only**      | Structurally impossible                                                                                                  |
| Derived nodes carry no row, so no links                                | gap 4                                                   | **Partially open** | See [below](#gap-4-is-only-partially-closed)                                                                             |
| Tooltip unit decided by frame order, not the hovered item              | `formatter.ts`, `Panel.tsx`                             | **Wide only**      | Each mark has its own `field.display`                                                                                    |
| `custom.hideFrom` registered with no reachable editor                  | `lib/grafana/editor/common/fieldConfig.ts`              | **Wide only**      | Becomes a real per-mark override; `addHiddenSeriesHideFrom` stays for legacy                                             |
| Legend hiding re-implemented by name; `stripHiddenValueFields` skipped | `charts/relations.ts`, `options/panelOption.ts`         | **Wide only**      | Both stay in place for legacy input                                                                                      |
| Per-item colour, links, size, curveness                                | `relations-item-overrides.md` (unbuilt)                 | **Closed**         | A `byName` override. No new editor, no new schema, no `relationsItemRules`                                               |
| Two SQL Expressions to reshape Prometheus                              | `relations-data-sources.md`                             | **Closed**         | One `legendFormat`. Verified — but the legend format is **required**, not optional (see the contract's Sourcing section) |
| Instant queries mandatory                                              | `relations-data-sources.md`                             | **Closed**         | A range query is a row dimension, reduced by `calcs[0]`                                                                  |

### Every field of `node-graph.md`

Exhaustive: every field of both tables in
[node-graph.md](../data-plane/node-graph.md). The wide-form target for each is in
[the contract's mapping](../data-plane/graph-wide.md#complete-mapping-from-graph--long);
this table adds the verdict.

**Edges frame**

| Long-form field   | Verdict           | Reason                                                                                                                                                     |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | **Closed**        | Becomes `field.name`, and therefore the override target it never was                                                                                       |
| `source`          | **Closed**        | `field.labels.source`, or the name split                                                                                                                   |
| `target`          | **Closed**        | `field.labels.target`, or the name split                                                                                                                   |
| `mainstat`        | **Closed**        | The field's own values, reduced by `calcs[0]`. Its string form is gone — see [Deliberately not carried over](#deliberately-not-carried-over)               |
| `secondarystat`   | **Closed**        | `calcs[1]`                                                                                                                                                 |
| `thickness`       | **Wide only**     | `config.custom.lineWidth`, a real per-edge override                                                                                                        |
| `color`           | **Wide only**     | `config.color`, all eight modes                                                                                                                            |
| `strokedasharray` | **Closed, lossy** | `config.custom.lineType` picks one of three ECharts types directly instead of approximating an SVG dash array — better, but still not a dash array         |
| `detail__*`       | **Open**          | Becomes `field.labels`, which is addressable but still has no surface — ECharts has no context menu. Folding labels into tooltip rows is a separate change |
| `highlighted`     | **Dropped**       | Deprecated for edges since Grafana 10.5 — use colour                                                                                                       |

**Nodes frame**

| Long-form field  | Verdict       | Reason                                                                                                                                                                                                  |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | **Closed**    | `field.name`                                                                                                                                                                                            |
| `title`          | **Closed**    | `config.displayName`; `rowsToFields` maps a `title` column onto it with one explicit mapping                                                                                                            |
| `subtitle`       | **Wide only** | `config.custom.subtitle`                                                                                                                                                                                |
| `mainstat`       | **Closed**    | Values reduced by `calcs[0]`, with the field's own unit and decimals — which the long form cannot vary per node                                                                                         |
| `secondarystat`  | **Closed**    | `calcs[1]`                                                                                                                                                                                              |
| `color` (string) | **Wide only** | `config.color.fixedColor`. `rowsToFields` converts a legacy `color` column automatically (verified)                                                                                                     |
| `color` (number) | **Wide only** | Specced in the long form and implemented by nobody; here it is just a by-value scheme                                                                                                                   |
| `noderadius`     | **Wide only** | `config.custom.nodeRadius` — and it stops contaminating `field.state.range`                                                                                                                             |
| `fixedx`         | **Wide only** | `config.custom.fixedX`; the all-or-nothing rule is unchanged                                                                                                                                            |
| `fixedy`         | **Wide only** | `config.custom.fixedY`                                                                                                                                                                                  |
| `arc__*`         | **Open**      | Mapped to `config.thresholds`, which is an ordered partition of the value domain, not arbitrary proportions summing to 1 — and no ECharts relationship series draws a multi-section ring in either form |
| `detail__*`      | **Open**      | As for edges — labels, no surface                                                                                                                                                                       |
| `icon`           | **Open**      | Becomes `config.custom.icon`, but the values are Grafana icon names and still need resolving to an ECharts `symbol`                                                                                     |
| `highlighted`    | **Dropped**   | No emphasis-by-data concept in either form; hover and legend emphasis cover it                                                                                                                          |
| `isinstrumented` | **Dropped**   | Never rendered by this plugin in either form                                                                                                                                                            |

Two capabilities have **no long-form field at all** and exist only under the wide
contract: `config.links` per mark (the whole of
[relations-data-links.md](./relations-data-links.md)) and `config.custom.hideFrom` per
mark. Both are **wide only**.

### Gap 4 is only partially closed

`relations-data-links.md` gap 4 — a node **derived** from the edges frame has no backing
row, so it can carry no link — is **partially open** under the wide contract, and the
reason is the same one, restated: a derived node has no _field_ either, so there is
nothing for an override to land on.

What changes: the wide contract makes supplying a nodes frame cheap and side-effect-free
(one field per node, no stat columns to contaminate the colour domain, config editable in
the UI), so "add a nodes frame" is a real answer rather than a chore. What does not
change: an edges-only response still renders nodes that cannot be individually
configured. Any fix is the same open design question the gap already poses — whether a
derived node should union the config of its incident edges — and it has no precedent in
this repo.

The matrix does not claim a clean sweep.

## Per-gap disposition for the three to-do docs

### `relations-item-overrides.md`

The doc's own question — how does a user say "colour `eu-west` red" — is answered by the
contract, so its **recommendation is superseded**:

- **Option 1 (plugin-local `options.relationsItemRules`)** — **do not build.** It was the
  recommendation; the contract makes it unnecessary for this family. Nothing in the proof
  dashboard uses a plugin-local mechanism.
- **Options 3 and 5 (core matcher-UI changes)** — still not recommended, unchanged.
- **Option 4 (core item overrides,
  [#129905](https://github.com/grafana/grafana/pull/129905))** — the honest claim is
  narrower than "unnecessary": graph frames do not need it, and by the same argument nor
  do pie or hierarchy, but marks that are irreducibly not fields (canvas elements,
  geomap features) are outside what a pivot reaches. If a core change is wanted, the
  cheaper door is `MatcherScope`, which already ships and which the editor already
  writes into dashboard JSON (`scope: 'series'`, observed in 13.1.0).
- Its **"is the field override UI useless"** table can be rewritten row by row: every
  **No** becomes a **Yes** for wide input.
- Its open question _"should an item rule beat a data-driven `color` column"_ **dissolves**:
  there is no separate rule system, and `rowsToFields` turns a legacy `color` column into
  `config.color.fixedColor`, where an override beats it exactly as it does everywhere
  else in Grafana.

### `relations-data-links.md`

- Gaps **1, 2, 3** — closed for wide input, structurally.
- Gap **4** — partially open, above.
- Gap **5** — already fixed, unchanged.
- Options **B** (resolve from every field of the row) and **C** (empty-URL convention)
  become **unnecessary for wide input** and stay the answer for legacy input. **D**
  (a `link__*` column convention) is now clearly wrong: `config.links` is the real thing.
  **E** (a panel-option map) stays rejected.
- The doc's note that relations has **no case in `dataLinks.test.tsx`** still stands and
  is now more important, because a per-mark link is the headline capability.

### `relations-color-schemes.md`

- Problem **1** (the two-branch dispatch) — closed for relations by deletion, **still
  open for hierarchy**, which shares the identical guard. **Do not delete this doc.**
- Problem **2** (no way to target one node or one edge) — closed.
- **A1** — still needed, for hierarchy.
- **A2** — dissolves. There is no "which field's scheme applies to which number"
  question when the mark _is_ the field.
- **A3** (bounded domain) — dissolves for wide input; the measured range is mark values
  only.
- **A4** (theme-resolve the override) — **already true** and always was:
  `applyFieldOverrides` resolves `fixedColor` through the theme before the panel sees it
  (measured). The bug is that pie and relations re-resolve it from `fieldConfig`
  themselves instead of reading `field.display`. Worth fixing at the source anyway,
  because pie and hierarchy still do.
- **B1/B2** (legend as the targeting surface) — unnecessary for wide input; the legend
  colour picker writes an ordinary `byName` override that the engine applies.
- **B5** (honour `byRegexp` in `getSeriesColorOverride`) — dissolves, and its named
  hazard becomes a real behaviour worth documenting instead: `byRegexp` tests the
  **display name**, so `/^e1$/` fails on a labelled field whose display name is
  `e1 {source="a", target="b"}`.

## Deliberately not carried over

- **`options.relationsItemRules`** and `RelationsItemRulesEditor` — never built, and now
  never will be.
- **The 14 lowercase field-name constants** and their readers (`readNodes`, `readLinks`,
  `colorAt`, `numberAt`, `stringAt`) — legacy-only, isolated inside `legacyToWide`.
- **`getNodeGraphValueField` / `getLinkValueField`** and the frame-mismatch bug between
  them — there is no "the value field" any more.
- **The `mainstat → thickness → 1` weight chain** — a mark's field is numeric by
  contract.
- **`resolveArcBorderColor`** — thresholds replace it, with the same honest loss of
  proportion.
- **`toLineType`** — `custom.lineType` is chosen, not inferred from a dash array.
- **A string `mainstat`** — not expressible, and not missed: `config.mappings` turns a
  number into text at display time, which is what a string stat was standing in for.

## Risks

**Two contracts coexisting is more complexity, not less, until legacy is dropped.** The
architectural rule is what keeps it bounded: the adapter sits at the frame boundary, the
converter sees only the wide form, so legacy costs exactly one function and its removal
is that function's deletion.

**Field-count explosion.** `applyFieldOverrides` is O(fields × rules) and the override
picker is a combobox over every display name _and_ every base name. The contract states a
practical ceiling of a few hundred marks per frame; the migration should measure the
relations panel specifically against TestData `node_graph` `response_medium` through
`rowsToFields` before phase 6.

**The legacy notice could be noise.** Every existing relations dashboard is legacy, so
every one of them would show the notice on day one. It should be dismissible, or gated on
the panel having at least one override that failed to match — which is measurable, since
an unmatched `byName` override is exactly what the picker renders as `(not found)`.

**A `csv_content` fixture cannot express labels or config**, so the repo's own provisioned
fixtures are the least convenient possible input for the new contract. `rowsToFields`
covers it (proof dashboard panel 7), at the cost of every wide fixture needing two
transforms.

## References

- The contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- The legacy format, still supported: [../data-plane/node-graph.md](../data-plane/node-graph.md)
- Proof dashboard: `provisioning/dashboards/relations/graph-wide.json`
- Sourcing: [../docs/relations-data-sources.md](../docs/relations-data-sources.md)
- The question this answers: [relations-item-overrides.md](./relations-item-overrides.md)
- Still open for hierarchy: [relations-color-schemes.md](./relations-color-schemes.md)
- Gap 4 remains: [relations-data-links.md](./relations-data-links.md)
- Editor parity: [../src/modules/relations/parity.md](../src/modules/relations/parity.md)
- The core proposal this reframes:
  [grafana/grafana#129905](https://github.com/grafana/grafana/pull/129905)
