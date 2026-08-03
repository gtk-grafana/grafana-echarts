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

**The invariant was re-verified against `v13.1.0` and `@grafana/scenes` v8.13.6, and one
open proposal would change it.** Grafana's ad-hoc panel transformations stack
([#129542](https://github.com/grafana/grafana/pull/129542) and its four siblings, all open
drafts) lets a panel bypass the pipeline and re-run transformations _then_
`applyFieldOverrides` itself, so per-mark overrides really would apply. It is still not the
answer here — the conversion has to be written into persisted dashboard JSON by a render
effect rather than declared, the override picker keeps listing pre-transform field names,
and the bypass is keyed on plugin **id** so it would apply to every family in this plugin
at once. Full analysis, including the smaller core change that would work:
[graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md).

## The release prerequisite

**The relations family cannot ship on the wide contract until core can convert a legacy
frame to wide _above_ the panel.** This is a hard gate, not a preference, and the reason is
arithmetic: every datasource emits the long form today, so on day one every frame the family
sees is legacy. Without a core conversion the only story is "add two transformations to every
panel", and even then the override picker lists the pre-conversion field names — so the
headline capability, targeting one node by name from the UI, is unreachable through the UI.

The smallest core change that closes it is a **declarative, non-persisted pipeline prefix**:
the panel plugin declares a hook, `SceneDataTransformer.transform()` asks the `VizPanel` it
feeds for it and prepends the result before `transformDataFrame`. The panel declares; the
transformer asks; nothing is persisted; the override picker is fixed for free because the
pane reads the transformer's output. Mechanism, the three places the conversion could live,
and why the ad-hoc-transformations stack is the wrong shape for this:
[graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md#where-should-the-conversion-live).

Two consequences for this plan:

- **Phase 0 is a core proposal**, and it is on the critical path. Everything else can proceed
  in parallel, because the plugin-side work is identical whether the conversion arrives from
  core, from a user transformation, or from a datasource.
- **The in-plugin `legacyToWide` is a development affordance, not a shipped feature.** It
  exists so phases 2–5 can be built and tested before the core change lands, and so a legacy
  frame renders rather than throwing. It is explicitly _not_ the answer to per-mark overrides,
  because it runs after `applyFieldOverrides`. Do not document it to users as one.

Datasource-native `graph-*-wide` (Tempo, X-Ray) remains the performance endgame and needs no
dashboard change once the prefix exists: wide input makes the hook return `[]`.

## Phase order

Phase 0 runs in parallel with the rest and gates release. Phases 1–6 are each independently
shippable and independently reviewable.

### Phase 0 — the core conversion (release gate, parallel track)

Designed in [adhoc-transformations-split.md](./adhoc-transformations-split.md), which carries
the proposed `PanelPlugin.setPipelinePrefix` API, the exact insertion point in
`SceneDataTransformer.transform()`, and a PoC plan. Two findings from it that this plan
depends on:

- The transformer's early return is `if (this.state.transformations.length === 0 || !data)`
  (verified in `@grafana/scenes` v8.13.6) — which is **every legacy relations dashboard**, so
  that guard has to be split for a prefix to run at all. It is the one behavioural change and
  it touches every panel in every dashboard.
- The prefix must be spliced **after** `_interpolateVariablesInTransformationConfigs`, which
  early-returns un-interpolated when the variable-dependency set is empty. Splicing before it
  would interpolate the prefix only when some unrelated user transformation happened to
  reference a variable.

- Write the core proposal for the pipeline prefix, using this repo's contract and proof
  dashboard as the worked example.
- Make the case on more than graph frames: the logs table in
  [#129563](https://github.com/grafana/grafana/pull/129563) has the identical problem — its
  `extractFields` entries run inside the panel, so extracted fields are invisible to the
  override picker too.
- Mirror the change on `PanelQueryRunner.applyTransformations` so Explore and bare
  `PanelRenderer` behave the same.
- **Exit criterion:** a legacy node-graph query, on an unmodified dashboard, produces an
  override picker listing node and edge names.

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
    `b-->d` simply disappears.
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

## Dropping long support entirely

The obvious simplification: if the wide contract is better, why keep a long reader at all?
This section is the triple-check. **Verdict: do not drop it in this package yet** — not
because the plugin code is hard to keep, but because of what it does to the datasources
that only speak long, and to the side-by-side comparison with core's Node graph that the
whole `parity.md` method rests on.

### What it would actually delete

Small, and that is the point — the adapter is one function at the frame boundary:

| Deleted                                                                                                                                                     | Size                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `legacyToWide` plus the 14 lowercase field-name constants and `readNodes` / `readLinks` / `colorAt` / `numberAt` / `stringAt`                               | most of `converters/nodeGraph.ts` (381 lines)      |
| `isEdgesFrame` / `isNodesFrame` / `isNodeGraphFrames`, replaced by the wide shape test                                                                      | ~30 lines                                          |
| `resolveArcBorderColor`, `toLineType`                                                                                                                       | ~30 lines                                          |
| The `dataFormat` panel option and its `auto` resolution                                                                                                     | the whole option                                   |
| The legacy branch of every "keep both for legacy input" caveat in phases 3–5                                                                                | the caveats, which are the complexity that matters |
| `converters/nodeGraph.test.ts` and the long fixtures inside `charts/relations.test.ts`, `options/{graph,sankey,chord}.test.ts`, `relations.canvas.test.tsx` | 7 test files carry long fixtures                   |

So the code saving is real but modest, and it is concentrated in exactly the place the
architectural rule already isolates. **Keeping legacy costs one function; dropping it saves
one function.** That symmetry is why the decision turns on the consequences below rather
than on the diff.

### What functionality would be lost in this package

| Lost                                                                       | Severity     | Detail                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tempo, AWS X-Ray and TestData `node_graph` stop working out of the box** | **Severe**   | All three emit long natively and will for years. Each panel would need two user-added transformations, and — measured on `response_small`, a saved X-Ray map — zero-config `rowsToFields` names the node fields `0`…`16` and picks the wrong edge stat, so it needs four explicit mappings to be useful. See the [reality check](../data-plane/graph-wide.md#reality-check-the-natively-long-producers-are-the-awkward-case) |
| **Every provisioned relations fixture breaks**                             | **Accepted** | `chord.json` (7 CSV + 1 `node_graph`), `sankey.json` (8 + 2), `node-graph-testdata.json` (1 + 10) — 29 panels to rewrite. They are ours to rewrite, the wide fixtures are shorter, and this is scheduled into phase 6 rather than weighed as a cost                                                                                                                                                                          |
| **A string `mainstat`**                                                    | Minor        | Legal in the long form and used by X-Ray (`"Success 100.00%"`). Under the wide contract a mark's field is numeric; `config.mappings` covers the display-text case but not an arbitrary computed string                                                                                                                                                                                                                       |
| **Parallel edges from an unmodified query**                                | Minor        | Two long rows over one pair are fine; the wide equivalent needs distinct ids and labels, which only `rowsToFields` can produce                                                                                                                                                                                                                                                                                               |
| **The cheapest shape at very large scale**                                 | Minor        | 5 000 marks is 0.1 ms in long and ~19 ms in edge-per-field wide. Only matters where nothing is configured per mark — see [Performance](../data-plane/graph-wide.md#performance-which-frame-shape-is-cheapest)                                                                                                                                                                                                                |
| **Edges-only responses that derive their node set**                        | None         | Unaffected — a wide edges frame derives nodes from labels or name splits exactly as the long form derives them from `source`/`target`                                                                                                                                                                                                                                                                                        |
| **Suggestions**                                                            | None today   | Never suggested in either form. But note that `hasPreferredVisualisationType('nodeGraph')` — which all three natively-long datasources set — is the **only** summary signal that identifies graph data without walking frames; dropping the long reader throws away the one suggestion hook that works. See [Frame meta](../data-plane/graph-wide.md#frame-meta)                                                             |

### What parity would be lost or made complex

This is the part that is easy to underweight. `src/modules/relations/parity.md` compares
this module against core's Node graph, and the method is a **byte-identical query rendered
by both panels side by side** — `sankey.json` panels 3 and 4 are exactly that, and it is
how the cycle policy was demonstrated at all.

| Consequence                                                                   | Why it hurts                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **No byte-identical side-by-side is possible**                                | Core's Node graph reads long; a wide-only relations panel reads wide. One query cannot feed both, so every comparison panel needs either two queries or a transformation on one side — and then it is not the same input             |
| **The comparison is no longer of _panels_ but of _pipelines_**                | A reviewer looking at a difference cannot tell whether the panel or the reshaping caused it. That is a real loss of diagnostic value, not a cosmetic one                                                                             |
| **`arc__*`, `icon`, `detail__*`, `isinstrumented` parity becomes untestable** | These are the four long-form fields this plugin already drops or approximates. Today the parity claim is checkable against core on one query; wide-only makes it a claim about a transformed frame                                   |
| **Core interop becomes strictly one-directional**                             | A user cannot point core's Node graph at a wide frame at all, so a dashboard mixing the two panels needs both formats queried. The reverse transformation (wide → long) is the core change named in the contract's out-of-scope list |
| **Documentation debt doubles rather than halves**                             | `data-plane/node-graph.md` must stay — it documents a published core format — but it would no longer describe anything this plugin reads, so the folder carries a spec with no consumer                                              |

### The narrow case for dropping it anyway

Stated fairly, because it is not weak:

- The two contracts genuinely are more complexity than one, and every "keep this for legacy
  input" caveat in phases 3–5 is a branch that will rot.
- Legacy input can never gain per-mark overrides, so a legacy render is permanently
  second-class. Supporting it invites users into the worse half of the panel.
- `rowsToFields` is stock Grafana, discoverable in the Transform tab, and — unlike an
  in-panel adapter — it is _visible_, which is the property the adapter decision above
  already chose to prioritise.

### Recommendation

**Drop the long reader as soon as the phase 0 prefix lands, and treat provisioned-fixture
churn as an accepted cost.** The core conversion changes the calculus on every objection
above, because it moves the conversion to where both panels can be fed from one query:

| Objection                                  | Under the phase 0 prefix                                                                                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo / X-Ray / TestData stop working      | **Resolved.** They keep emitting long; the prefix converts it. No user action, no transformation in the panel, and the override picker lists node names                                                                       |
| Provisioned fixtures break                 | **Accepted.** 29 panels get rewritten as part of phase 6. They are ours, and the wide fixtures are shorter                                                                                                                    |
| Byte-identical side-by-side parity is lost | **Resolved, and this is the important one.** One legacy query can feed both panels: core Node graph reads the long frames, the relations panel's prefix converts them. The comparison is still of _panels_ on identical input |
| A string `mainstat`                        | Still lost. `config.mappings` covers the display-text case; an arbitrary computed string does not survive the pivot                                                                                                           |
| Parallel edges from an unmodified query    | Still needs the conversion to emit labels — which `legacyToWide` and the prefix both must, per the contract                                                                                                                   |
| Cheapest shape at very large scale         | Still true, and still only matters where nothing is configured per mark                                                                                                                                                       |

So the sequence that minimises total work is: **phase 0 in parallel from the start; phases
1–5 against the dev-only adapter; delete the adapter and the long reader in phase 6, at the
same time as the fixtures are rewritten.** That way the "keep both for legacy input" caveats
in phases 3–5 are written once and deleted once, rather than maintained.

If phase 0 stalls, the fallback is not to ship the wide contract with a user-transformation
story — it is to keep the family on the long form and keep the plan on the shelf. Shipping a
panel whose headline feature requires two manual transformations per dashboard would be the
debt this whole exercise exists to avoid.

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
