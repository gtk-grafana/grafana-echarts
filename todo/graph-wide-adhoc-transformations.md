# Would ad-hoc panel transformations solve the graph-wide migration?

> **Status: all five PRs are open drafts, checked 2026-08-01.** The stack is
> [#129542](https://github.com/grafana/grafana/pull/129542) (backend schema + plugin
> capability, base `main`) → [#129544](https://github.com/grafana/grafana/pull/129544)
> (frontend plumbing) → [#129545](https://github.com/grafana/grafana/pull/129545) (the
> `@grafana/ui` hooks) → [#129546](https://github.com/grafana/grafana/pull/129546) (table
> adoption) and [#129563](https://github.com/grafana/grafana/pull/129563) (logs-table
> adoption). All are `isDraft: true`, `state: OPEN`, all authored by `gtk-grafana`, none
> reviewed. #129542's own body says **"PoC / UNVERIFIED"**. It also depends on an
> unmerged upstream: [grafana/scenes#1589](https://github.com/grafana/scenes/pull/1589)
> ("SceneDataTransform - skip transformations - PoC", open draft), which the plan expects
> to ship as `@grafana/scenes` 8.14.0. Nothing here is landed and every line quoted below
> can still change.
>
> The design document lives in the branch, not in the PR description:
> `.air/plans/ad-hoc-panel-transformations.plan.md` on
> `gtk-grafana/dataviz/ad-hoc-transforms-poc__0-backend-schema`. It is the most useful
> single source and is cited throughout.

This doc answers exactly one question, the one that decides whether
[graph-wide-migration.md](./graph-wide-migration.md)'s central asymmetry survives:
**could the core Node graph panel, or this plugin's relations panel, declare a
legacy-long → wide conversion that runs early enough for per-node and per-edge field
overrides to work?** Everything else about the stack is secondary and is only mentioned
where it bears on that.

## The pipeline as it is today

Verified against `@grafana/scenes` v8.13.6 (the version Grafana 13.1.x ships) and
grafana/grafana `v13.1.0`. Line numbers are from those tags.

### The scenes path — every dashboard in 13.x

| Step | Where                                                                                           | What runs                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `SceneQueryRunner`                                                                              | queries; emits `PanelData` into `$data`                                                                                              |
| 2    | `SceneDataTransformer.transform()` — `packages/scenes/src/querying/SceneDataTransformer.ts:208` | `_interpolateVariablesInTransformationConfigs` (`:265`), then `transformDataFrame(seriesTransformations, data.series, ctx)` (`:296`) |
| 3    | `VizPanelRenderer` — `packages/scenes/src/components/VizPanel/VizPanelRenderer.tsx:106-115`     | `sceneGraph.getData(model)` → `dataObject.useState()` → `useDataWithSeriesLimit` → `model.applyFieldConfig(...)`                     |
| 4    | `VizPanel.applyFieldConfig()` — `packages/scenes/src/components/VizPanel/VizPanel.tsx:511`      | `applyFieldOverrides({ data: rawData.series, fieldConfig: this.state.fieldConfig, … })` (`:547-549`)                                 |
| 5    | `VizPanelRenderer.tsx:242`, `:325`                                                              | `const data = dataWithFieldConfig!` → `<PanelComponent data={data} … />`                                                             |

So the ordering is **query → transformations → `applyFieldOverrides` → panel**, and the
transformer's output is the _only_ thing the override pass ever sees. Note that step 2
short-circuits when the array is empty (`SceneDataTransformer.ts:227`), and that
`transformDataFrame` deliberately skips its own variable interpolation inside a scene —
`const isScenes = window.__grafanaSceneContext != null` (verified in the installed
`@grafana/data` 13.1.1 build, `dist/esm/transformations/transformDataFrame.mjs:38`) —
which is why step 2 pre-interpolates and why anything that reimplements step 2 must too.

### The non-scenes path agrees

`PanelQueryRunner.getData` (`public/app/features/query/state/PanelQueryRunner.ts:96`)
calls `this.applyTransformations(data)` at `:134` (which reaches `transformDataFrame` at
`:237`) and only then `applyFieldOverrides` at `:186`. `PanelRenderer`
(`public/app/features/panel/components/PanelRenderer.tsx:42`) has no transformation step
at all: it goes straight to `useFieldOverrides(...)` and hands the result to the panel at
`:99`.

**The invariant is unconditional in 13.1.0: no code path applies a transformation after
`applyFieldOverrides`.** That is precisely why the migration plan's asymmetry holds — an
adapter inside the panel is downstream of step 4, so a `byName` override on a node cannot
have matched anything when the override pass ran. `graph-wide-migration.md` states this
as "the one asymmetry that shapes everything"; this doc confirms it against the source
and then asks whether the ad-hoc stack changes it.

## What #129542 actually does

**#129542 on its own does nothing to the pipeline.** It is schema and capability
plumbing only: 54 files, all Go/CUE/generated, plus a feature toggle. Concretely:

| Change                                                                                   | File                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `panelAdHocTransformations` toggle, `FeatureStageExperimental`, `Expression: "false"`    | `pkg/services/featuremgmt/registry.go`                                                                                                                                                                               |
| `origin?: { source: "panel" \| "editor", pluginId?: string }` on the transformation kind | `kinds/dashboard/dashboard_kind.cue` + the v1, v2, v2alpha1, v2beta1 CUE specs                                                                                                                                       |
| `origin` carried through all six hand-written Go conversions                             | `apps/dashboard/pkg/migration/conversion/*.go`, with `transformation_origin_test.go`                                                                                                                                 |
| `adHocTransforms?: boolean` plugin capability                                            | `docs/sources/developers/plugins/plugin.schema.json`, `pkg/plugins/plugins.go`, `pkg/plugins/models.go` (`PanelDTO`), `pkg/api/bootdata.go`, `apps/plugins/kinds/meta.cue`, `apps/plugins/pkg/app/meta/converter.go` |

The capability reaches **external** plugins, not just core ones: `bootdata.go` builds the
panel meta map from `availablePlugins[plugins.TypePanel]`, which is populated from
`hs.pluginStore.Plugins(ctx, plugins.TypePanel)` (`pkg/api/bootdata.go:539-548` in
v13.1.0) — every installed panel plugin. #129544 also maps it in the v0alpha1 plugins-API
mapper (`packages/grafana-runtime/src/services/pluginMeta/mappers/v0alpha1PanelMapper.ts`)
and adds `PanelPluginMeta.adHocTransforms?: boolean`
(`packages/grafana-data/src/types/panel.ts:21+`). So this plugin could set
`"adHocTransforms": true` in `src/plugin.json` and be recognised.

### The mechanism is bypass, not reordering

The pipeline is not reordered. The panel opts **out** of it and re-implements steps 2–4
inside itself, in the right order.

1. **grafana/scenes#1589** adds `skipTransformations?: boolean` to
   `SceneDataTransformerState` and extends the early return:
   `if (this.state.skipTransformations || this.state.transformations.length === 0 || !data)`.
   `transformations` is still stored, serialised and scanned for variables — only
   execution stops. A `subscribeToState` handler calls `reprocessTransformations()` when
   the flag flips.
2. **#129544** sets the flag from plugin meta at all five `new SceneDataTransformer` sites
   plus a `$behaviors` sync, via
   `panelSkipsTransformationPipeline(pluginId)` in
   `public/app/features/dashboard-scene/scene/adHocTransformations.ts` —
   `return Boolean(meta?.adHocTransforms && !meta.skipDataQuery)`, gated on
   `config.featureToggles.panelAdHocTransformations`.
3. The same file adds five `PanelContext` members. Two matter here:

   ```ts
   // Source data before the pipeline AND before field config.
   context.getUntransformedData = () => { … transformer.state.$data?.state.data ?? transformer.state.data … };

   // A pure second applyFieldOverrides, using the panel's real field config.
   context.applyFieldConfig = (data) => ({
     ...data,
     series: applyFieldOverrides({ ...shared, data: data.series, fieldConfig: vizPanel.state.fieldConfig }),
   });
   ```

   `vizPanel.state.fieldConfig` is `{ defaults, overrides }` — the same object
   `VizPanel.applyFieldConfig` passes at `VizPanel.tsx:549`. **The override rules are in
   scope.**

4. **#129545** ships `useTransformedData(input)` in
   `packages/grafana-ui/src/components/PanelChrome/useTransformedData.ts`, which is where
   the ordering is restored:

   ```ts
   const source = (active && getUntransformedData?.()) || input;
   …
   transformPanelData(transformations, source).subscribe({ next: (transformed) => setResult(…) })
   …
   return applyFieldConfig ? applyFieldConfig(next) : next;
   ```

   Its own doc comment states the intent: _"Field config is applied *after* the
   transformations, which is what the normal pipeline does and what makes transformations
   that rename or create fields render correctly."_

So inside a bypassed panel the order is source → transformations → `applyFieldOverrides`,
and `props.data` (which still went through step 4 on the _untransformed_ frames) is
discarded. The plan calls that discarded pass out as a known cost — _"Wasted field-config
pass — `props.data` still costs a full `applyFieldOverrides` the ad-hoc panel discards"_ —
with the fix ("a `skipFieldConfig` flag on `VizPanel`") listed as upstream-only follow-up.

### The API surface a plugin would use

| Piece                                                                                                                                   | Where                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `"adHocTransforms": true`                                                                                                               | `plugin.json` (#129542 schema, #129546/#129563 usage) |
| `useTransformedData(props.data, options?)`                                                                                              | `@grafana/ui` (#129545, extended in #129563)          |
| `useAdHocTransformations()` → `{ enabled, transformations, adHocTransformations, add, replaceAdHoc, clearAdHoc, set }`                  | `@grafana/ui` (#129545, extended in #129563)          |
| `PanelContext.getUntransformedData` / `.applyFieldConfig` / `.getTransformations` / `.setTransformations` / `.isAdHocTransformsEnabled` | `@grafana/ui` `PanelContext` (#129544)                |

Adoption is genuinely one line for the simple case — `TablePanel.tsx` in #129546 is
`const { data } = useTransformedData(props.data);`.

### Where the panel's transformation is inserted

This is the crux, and the answer changed **between** #129545 and #129563.

In **#129545** panel entries can only go last. `replaceAdHoc` is
`set([...transformations.filter((t) => !isAdHoc(t)), ...configs.map(stamp)])`, documented
as _"Panel-created transformations therefore always run last"_, and the plan's Task 3
step 17 spells out the decision: _"**Append, never merge.** `add()` appends
unconditionally … so **ad-hoc transformations always run last**."_ A test locks it in.

In **#129563** the signature is widened to accept positions:

```ts
export interface AdHocTransformationPositions {
  before?: DataTransformerConfig[];
  after?: DataTransformerConfig[];
}
…
set([...before.map(stamp), ...transformations.filter((t) => !isAdHoc(t)), ...after.map(stamp)]);
```

documented as _"`before` entries run ahead of the whole editor pipeline"_. #129563's
`useLogsTableTransformations.ts` then uses it exactly the way a graph panel would need to,
and says so:

> _Order matters and is the reason this uses `replaceAdHoc({ before, after })`:_
> `extractFields -> (whatever the user added) -> organize`

**The user's hypothesis is confirmed on the ordering point.** #129542 does not carry the
insertion point; #129545 carries one that is explicitly last-only; the "insert at the
start of the stack" primitive exists only in #129563, added there because the logs-table
use case forced it. #129563's own PR body flags this as needing upstream attention: _"In
particular the additional pipeline was required to get the extracted fields before
organize fields is applied."_ (That sentence is about a second thing too — the
`splitTrailing` / `runPipeline` split which lets the panel see the intermediate stage.
Graph frames do not need that part.)

## Verdict: does it solve the graph-frame migration?

**Partially — the mechanism does make per-node and per-edge field overrides apply, but
not by "declaring" anything, not with #129542 alone, and not in a form a user could
author the overrides in.**

The reasoning, in the order the objections bite:

1. **The load-bearing question is answered yes.** `context.applyFieldConfig` runs
   `applyFieldOverrides` with `vizPanel.state.fieldConfig` over the _post-transformation_
   frames (#129544, `adHocTransformations.ts`), and `useTransformedData` calls it in that
   order (#129545). A `byName` override on a node id or an `a-->b` edge would match. This
   is a real change to the invariant established above, and it is the first mechanism in
   Grafana that produces one.
2. **Nothing is "declared".** There is no `PanelPlugin.setAdHocTransformations()`, no
   registry, no declarative prefix. Grepping all five diffs finds no `PanelPlugin` API
   addition. `adHocTransforms: true` means only "I own the whole pipeline"; the conversion
   itself has to be **written into the dashboard's persisted transformation array at
   runtime**, from a `useEffect`, the way `useLogsTableTransformations` does. That is a
   different and much larger thing than declaring a transformation.
3. **#129542 alone is insufficient in two independent ways.** It contains no insertion
   point at all, and the `before` position it would need only exists in #129563.
4. **The override editor still lists the wrong names.** Verified in v13.1.0:
   `PanelOptionsPane.tsx:175` is `const { data } = sceneGraph.getData(panel).useState();`
   and passes that to `<PanelOptions … data={data} />` at `:259`; `PanelOptions.tsx:60-72`
   feeds it straight to
   `getFieldOverrideCategories(fieldConfig, …, data?.series ?? [], searchQuery, …)`. Under
   bypass `SceneDataTransformer.state.data` is the _source_ data, so the "Fields with
   name" combobox would enumerate `id`, `source`, `target`, `mainstat` — the legacy
   columns — and never `eu-west` or `a-->b`. The override would work if hand-typed and be
   unpickable in the UI. Nothing in the stack touches this call site.
5. **It is off by default and experimental.** `Expression: "false"`,
   `FeatureStageExperimental` (#129542, `registry.go`), and
   `panelSkipsTransformationPipeline` returns `false` without the toggle. A migration that
   depends on it is gated on a toggle rollout, not on a release.

## What is missing

| Gap                                            | Why it matters for graph frames                                                                                                                                                                                                                                                                                               | Addressed?                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No declarative registration**                | The conversion must be written into persisted dashboard JSON by a render effect, not declared by the plugin. There is no "always run this first, invisibly" primitive.                                                                                                                                                        | **No.** No `PanelPlugin` API in any of the five diffs.                                                                                                      |
| **Ordering "first" is #129563-only**           | A legacy→wide conversion is useless anywhere but position 0; every user transformation downstream of it must see fields, not rows.                                                                                                                                                                                            | Partly: `replaceAdHoc({ before, after })` in **#129563**. Not in #129542 or #129545 (which is last-only).                                                   |
| **Position is not persisted**                  | `TransformationOrigin` is `{ source, pluginId? }` — provenance records _who_, not _where_. After reload the panel cannot tell a leading entry from a trailing one; it must re-derive both from data shape and rewrite.                                                                                                        | **No.** #129542's CUE has no position field; logstable works around it by rederiving every time.                                                            |
| **Override picker reads pre-transform frames** | The whole point of the pivot is that a user can target one node by name. Under bypass the picker offers legacy column names. Overrides apply but cannot be authored.                                                                                                                                                          | **No.** `PanelOptionsPane.tsx:175` / `PanelOptions.tsx:60-72` are untouched.                                                                                |
| **Writing the pipeline dirties the dashboard** | Every legacy relations/node-graph dashboard would show unsaved changes on open, because the panel's effect adds a transformation that was not in the saved model.                                                                                                                                                             | **No.** `DashboardSceneChangeTracker.isUpdatingPersistedState` returns `true` for any non-`data` `SceneDataTransformer` partial update (`:73-77`, v13.1.0). |
| **First-paint transient**                      | The conversion config is data-shape dependent, so it can only be derived once frames arrive (logstable returns early `if (!rawTableFrame)`). The first render is the legacy render — for this plugin, the throw.                                                                                                              | **No**, inherent to the effect-driven design.                                                                                                               |
| **Transform-tab UX**                           | The entry is visible and user-editable, and the panel fights the user for it (logstable rewrites the array if a row is dragged past its entries).                                                                                                                                                                             | Visible, but #129563's body lists **"Transform UI is broken for transformed added ad-hoc"** as a known bug.                                                 |
| **Snapshots**                                  | Re-checked against source and **less bad than first written**: `transformSceneToSaveModel.ts:344-349` deliberately stores the **pre-transform** frames for a `SceneDataTransformer` — _"For transformations the non-transformed data is snapshoted"_ — so a snapshot holds source frames and the consumer re-derives on load. | **Not a gap.** Correct by construction for a prefix, and correct for the bypass too, since the ad-hoc entries themselves are persisted and re-run           |
| **Explore / bare `PanelRenderer`**             | No host `PanelContext`, so `enabled` is false and (#129563) the pipeline lives in component state — unpersisted — and the panel must pass its own `options.applyFieldConfig` with its own `fieldConfigRegistry`.                                                                                                              | Partly, in **#129563** only (the `applyFieldConfig` and `transformations` options).                                                                         |
| **`applyFieldConfig` fidelity**                | #129544's helper passes `{ fieldConfigRegistry, replaceVariables, theme, timeZone }`; `VizPanel.applyFieldConfig` also passes `featureToggles: config.featureToggles` (`VizPanel.tsx:555`). A toggle-gated override behaviour would diverge.                                                                                  | **No**, and untested.                                                                                                                                       |
| **Interpolation is a JSON round-trip**         | `getTransformations` does `JSON.parse(sceneGraph.interpolate(transformer, JSON.stringify(raw), …))` whenever the JSON contains `$` or `[[`. A field/label name containing `$` in a `rowsToFields` mapping would be mangled.                                                                                                   | **No**, though it mirrors `SceneDataTransformer`'s own behaviour.                                                                                           |
| **Toggle-gated, experimental**                 | A migration path cannot rely on it until it is at least preview.                                                                                                                                                                                                                                                              | By design (`Expression: "false"`).                                                                                                                          |
| **`rowsToFields` strips `meta`**               | Independent of this stack, but it compounds: the conversion's output has no `meta.type`, so role resolution downstream is field-shape only, and suggestions lose `preferredVisualisationType`.                                                                                                                                | Out of scope for these PRs; already recorded in [graph-wide.md](../data-plane/graph-wide.md#frame-meta).                                                    |

Things the stack **does** get right for this use case, so they are not gaps: field
overrides see the output (#129544 + #129545), memoization is on frame identity not
`PanelData` identity (`useTransformedData` deps
`[active, transformations, splitTrailing, source.series, source.annotations]`), the
conversion **can** be conditional on input shape (logstable derives it from
`rawTableFrame`), `origin` round-trips v1 ↔ v2alpha1 ↔ v2beta1 ↔ v2 (#129542's Go
conversions + `transformation_origin_test.go`, plus #129544's v2 TS serializer), panel
inspect is fixed (`useRunPanelTransformations` in `InspectDataTab.tsx`), the panel-edit
preview is fixed (`PanelDataTransformationsTab.tsx`), and the `-- Dashboard --` datasource
`withTransforms` path is fixed (`datasource.ts`).

## What this would mean for the core Node graph panel

Little that is good, for one reason the stack cannot design around: **the core Node graph
panel is not a field-oriented panel.** Adopting `adHocTransforms` would hand it
untransformed data and require it to run and re-field-config the pipeline itself, and its
reward would be per-node overrides it has no code to read — it addresses marks by row
(`id`, `source`, `target` columns), not by `field.config`. The conversion would be the
easy half; teaching the panel to read `graph-*-wide` is the whole of
[graph-wide-migration.md](./graph-wide-migration.md) phases 2–5, and none of it gets
cheaper.

The specific costs land hard there too: every existing Tempo / X-Ray / TestData node-graph
dashboard is legacy, so every one of them would gain a panel-written transformation on
open and immediately read as dirty (gap 5), and users would then be offered an override
picker listing `id`/`mainstat` (gap 4).

There is one narrow, real win worth recording: the mechanism would let the core panel
**stop** needing a `rowsToFields` recipe in its docs. That is a documentation win, not an
architectural one.

## What this would mean for this plugin's relations family

The plugin is better placed than core, because the wide reader is the plan of record
rather than a hypothetical, and because `adHocTransforms` is reachable from
`src/plugin.json` for an external plugin (verified above). But the plan in
[graph-wide-migration.md](./graph-wide-migration.md) should **not** change on the strength
of this stack:

- **The "adapter decision" stands.** Option 3 — _detect, notify, render_ — chose a
  hand-rolled synchronous `legacyToWide` plus a `ChartNotices` corner notice, over
  delegating to `transformDataFrame`, for three reasons: async, host-registry dependence,
  and invisibility. Ad-hoc transformations fix the third (the entry is in the Transform
  tab) and make the second worse, not better: the panel now depends on
  `standardTransformersRegistry` resolving `rowsToFields` _and_ on
  `SceneDataTransformer.skipTransformations` _and_ on an experimental toggle _and_ on
  `PanelContext.applyFieldConfig` — four host contracts instead of one, three of them
  unmerged.
- **The capability matrix's "wide only" column does not collapse.** The matrix says
  legacy input keeps the legacy limit because an in-panel adapter runs after
  `applyFieldOverrides`. Under the ad-hoc stack a legacy dashboard could reach the wide
  column — but only after the panel has written a transformation into it, which is the
  same user-visible act as the notice's recommendation ("add a **Rows to fields**
  transformation"), performed without asking. The honest reframing is: **the stack does
  not remove the need for a transformation in the Transform tab; it automates putting one
  there.**
- **Bypass costs the panel a capability it currently has for free.** With
  `adHocTransforms: true` the panel owns the pipeline in _every_ dashboard, for _every_
  family — part-to-whole, hierarchy, cartesian, stream — not just relations, and not just
  for legacy input. `panelSkipsTransformationPipeline` keys on the plugin id, and this
  plugin is one plugin with one id. Every family would need `useTransformedData` wired,
  every family would lose the override-picker names (gap 4), and every existing dashboard
  with transformations would route through an unmerged code path. That is a very large
  blast radius for a legacy-input-only benefit.

**Recommendation: do not block, do not adopt.** Ship phases 1–2 of the migration as
planned (hand-rolled `legacyToWide` at the frame boundary + the notice), and treat this
stack as evidence for what a _narrower_ core change should look like.

## Where should the conversion live?

Every datasource emits the long form today, so **every** frame the relations family sees on
day one will be legacy. A user-exposed transformation is therefore not a viable migration
story: it would mean "this panel does not work until you add two transformations", on every
panel, forever, and the override picker would still list the untransformed field names until
the user added them. That makes the conversion a **release prerequisite**, not a follow-up.

There are exactly three places it can go. They are not alternatives so much as a sequence.

| Where                                                                                                                      | Reaches every datasource?     | Override picker correct? | Needs datasource changes?         | Perf                                                     | Available when?                           |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------ | --------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| **A. Datasource backend** emits `graph-*-wide` natively                                                                    | No — one datasource at a time | Yes                      | **Yes, all of them**              | Best — pivot happens once, server-side, no frontend cost | Years, per datasource                     |
| **B. Request-level negotiation** — the query declares a wanted frame type, a core shim converts when the datasource cannot | Yes                           | Yes                      | No (shim), Yes (to skip the shim) | Good — one conversion, in the query layer                | Needs new core API                        |
| **C. Core pipeline prefix** — panel declares a conversion, `SceneDataTransformer` prepends it                              | Yes                           | **Yes** — see below      | No                                | Adequate — a frontend pivot per render, memoized         | Smallest core change; nothing else needed |

**C is the one to propose, and A is the endgame.** C is strictly smaller than B (no query
API, no protocol negotiation, no server involvement), it works for every datasource
immediately including ones that will never change, and it is where the override picker gets
fixed for free. A is what makes it fast later, per datasource, without any dashboard
changing: once Tempo emits `graph-edges-wide` with `meta.type` set, the panel's conversion
hook returns `[]` for that response and the prefix is a no-op. B only becomes interesting if
some datasource needs to know the wanted shape in order to query differently — which for
graph frames it does not, since the pivot is pure reshaping.

### How would Grafana know the panel wants wide frames? (the mechanism)

This is the part that sounds circular and is not: **Grafana does not infer it — the panel
declares it, and the transformer asks the panel it is feeding.**

`SceneDataTransformer` sits between the query runner and exactly one `VizPanel`, and it can
walk to it. #129544 already does precisely this for a different purpose:
`syncSkipTransformationsBehavior` reaches the panel via `transformer.parent instanceof
VizPanel`, then `vizPanel.getPlugin()`. So inside `transform()` the transformer can:

1. resolve its parent `VizPanel` → `vizPanel.getPlugin()` → the `PanelPlugin`;
2. read an optional hook off the plugin — the plugin, not the dashboard, not the query;
3. call it with the source frames and prepend whatever `DataTransformerConfig[]` it returns.

No datasource is involved and nothing is guessed. The knowledge flows **panel → transformer**,
in the same direction as `fieldConfigRegistry` and `dataSupport` already do. A panel that
does not implement the hook is unaffected, which is why this is additive.

The hook is _conditional on the data_, which is what makes it safe to leave on permanently:

```ts
// Illustrative only — not an API proposal.
relationsPlugin.setPipelinePrefix((frames) =>
  isGraphWideFrames(frames) ? [] : legacyToWideTransformerConfigs(frames)
);
```

Wide input → `[]` → nothing happens. Legacy input → a `rowsToFields`-shaped prefix. A
datasource that later emits wide frames natively silently stops triggering it.

### Why this fixes the override picker, which is the actual blocker

`PanelOptionsPane.tsx:175` reads `sceneGraph.getData(panel).useState().data` — the
**transformer's output**. Under the ad-hoc bypass that is the untransformed source, which is
gap 4. Under a prefix executed _inside_ `transform()`, the transformer's output is the
converted frames, so the pane sees node and edge names with no further change. The user
authors `byName: 'eu-west'` from the picker, and the same frames feed the Transform tab, the
inspector, snapshots and the `-- Dashboard --` datasource, because none of them were bypassed.

That is the whole difference between the two designs: **bypass moves the panel out of the
pipeline; a prefix moves the conversion into it.**

### The same gap applies to the logs table, and it is not hypothetical

#129563 runs `extractFields` as a `before` entry inside the panel. Those extracted fields
therefore exist only downstream of `sceneGraph.getData(panel)`, so by the same code path
(`PanelOptionsPane.tsx:175` → `PanelOptions.tsx:60-72` → `getFieldOverrideCategories`) the
override picker cannot list them either. A user wanting to set a unit on an extracted log
field would have to hand-write the override. #129563's body already flags "Transform UI is
broken for transformed added ad-hoc" as a known bug; this is the field-config half of the
same root cause, and a pipeline prefix would fix both cases at once.

That is worth saying plainly because it changes who benefits: the prefix is not a
graph-frame special case. Any panel that needs to reshape before configuration — logs table,
graph frames, anything reading a fixed field convention — wants the same primitive.

> **Superseded in part.** The design sketched below has been worked up properly, with the
> project split into two initiatives, in
> [adhoc-transformations-split.md](./adhoc-transformations-split.md) — which carries the
> proposed `PanelPlugin` API, the exact insertion point, the plugin-load race that is the
> real implementation hazard, and a PoC plan. Read this section for the argument and that
> doc for the design.

## If it does not solve it, what would

The smallest core change that closes the graph case is a **declarative, non-persisted
pipeline prefix on the plugin**, executed by the transformer rather than by the panel.
Sketch, deliberately not an API proposal:

- `PanelPlugin` gains an optional hook that, given the source frames, returns
  `DataTransformerConfig[]` — for the relations family, `[]` for wide input and a
  `rowsToFields`-shaped config for legacy input.
- `SceneDataTransformer.transform()` prepends its result to `interpolatedTransformations`
  at `SceneDataTransformer.ts:265`, before the `transformDataFrame` call at `:296`. It
  needs the plugin, which it can reach the same way #129544's
  `syncSkipTransformationsBehavior` does: `transformer.parent instanceof VizPanel`.
- Nothing is persisted, nothing is stamped, nothing appears in dashboard JSON.

Why this is strictly smaller than the ad-hoc stack, gap by gap:

| Gap above                            | Under a declarative prefix                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No declarative registration          | Closed by construction — that is the whole feature                                                                                                                              |
| Ordering "first"                     | Closed by construction — the prefix is position 0                                                                                                                               |
| Position not persisted               | Moot — nothing persists                                                                                                                                                         |
| Override picker reads wrong frames   | **Closed for free.** `PanelOptionsPane.tsx:175` reads `sceneGraph.getData(panel).useState().data`, which is now the _converted_ frames, so the picker lists node and edge names |
| Dashboard dirtied on open            | Moot — no `setState` on the transformer's `transformations`                                                                                                                     |
| First-paint transient                | Closed — the prefix is computed inside `transform()`, on the same tick as the frames                                                                                            |
| Transform-tab UX / broken editor     | Moot — the entry is never in the array                                                                                                                                          |
| Snapshots, Inspect, `withTransforms` | Closed by construction — the pipeline is never bypassed, so every existing consumer of the transformer's output is correct                                                      |
| Second `applyFieldOverrides` pass    | Moot — step 4 is untouched and runs once, in its existing place                                                                                                                 |
| Explore / bare `PanelRenderer`       | Still open; a prefix on `SceneDataTransformer` does not reach `PanelQueryRunner.applyTransformations`, which would need the mirror change                                       |

The prefix is also honest about what it is not: it does not give a panel a transformation
_UI_, which is the actual motivation for #129542's stack. The two features are
complementary rather than competing, and conflating them is what makes the ad-hoc stack
an awkward fit here — the table and logs-table cases want _user-initiated, persisted_
transformations; the graph case wants an _automatic, invisible_ one.

**Two cheaper options remain on the table and need no core change at all:** the notice +
documented `rowsToFields` recipe already chosen in
[graph-wide-migration.md](./graph-wide-migration.md), and datasources emitting
`graph-*-wide` natively so no conversion exists to order.

### What would settle the open uncertainties

Everything above is read from the diffs; three claims deserve a running instance before
anyone acts on them.

| Uncertainty                                                                                          | What would settle it                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether a `byName` override on a wide field name actually applies through `context.applyFieldConfig` | Run #129563's branch with the toggle on, put a table panel on legacy node-graph CSV, `replaceAdHoc({ before: [rowsToFields] })`, add a `byName` override on an edge id, and read `field.config.color` back through `System.import('@grafana/data')`                                                                                                                                      |
| Whether the override picker really lists pre-transform names                                         | Same branch: open the override editor on that panel and read the combobox. The code path (`PanelOptionsPane.tsx:175`) is unambiguous but the rendered list is the claim that matters                                                                                                                                                                                                     |
| Whether opening a legacy dashboard marks it dirty                                                    | Same branch: open, do nothing, watch for the unsaved-changes indicator. `DashboardSceneChangeTracker:73-77` says it will; `detectSaveModelChanges` debounces and diffs, so the outcome depends on whether the effect's write changes the save model — on a legacy dashboard it does                                                                                                      |
| ~~Whether `PanelEditNext` has the same override-picker path~~                                        | **Resolved.** `getFieldOverrideCategories` has exactly four hits in 13.1.0 (definition, its test, `PanelOptions.tsx`, legacy `OptionsPaneOptions.tsx`), and `PanelEditNext` renders the _same_ `PanelOptionsPane` object — constructed once at `PanelEditor.tsx:234`, rendered at `PanelEditNext/PanelEditorRendererNext.tsx:54`. One fix covers both editors; the bypass covers neither |

## References

**PRs**

- [grafana/grafana#129542](https://github.com/grafana/grafana/pull/129542) — backend
  schema and plugin capability (open draft, "PoC / UNVERIFIED")
- [grafana/grafana#129544](https://github.com/grafana/grafana/pull/129544) — frontend
  plumbing, `PanelContext` members, `transformPanelData`, `runPanelTransformations`
- [grafana/grafana#129545](https://github.com/grafana/grafana/pull/129545) —
  `useAdHocTransformations` / `useTransformedData`
- [grafana/grafana#129546](https://github.com/grafana/grafana/pull/129546) — table
  adoption ("Hide column")
- [grafana/grafana#129563](https://github.com/grafana/grafana/pull/129563) — logs-table
  adoption; adds `replaceAdHoc({ before, after })` and `splitTrailing`
- [grafana/scenes#1589](https://github.com/grafana/scenes/pull/1589) —
  `SceneDataTransformer.skipTransformations` (open draft)
- [grafana/grafana#129905](https://github.com/grafana/grafana/pull/129905) — the item-override
  proposal this doc's question is adjacent to, reframed in
  [graph-wide-migration.md](./graph-wide-migration.md)
- Superseded earlier spike, both closed:
  [#124605](https://github.com/grafana/grafana/pull/124605),
  [#124607](https://github.com/grafana/grafana/pull/124607)

**Grafana source, `v13.1.0`**

- `public/app/features/query/state/PanelQueryRunner.ts:96,134,186,237`
- `public/app/features/panel/components/PanelRenderer.tsx:42,99`
- `public/app/features/dashboard-scene/panel-edit/PanelOptionsPane.tsx:175,259`
- `public/app/features/dashboard-scene/panel-edit/PanelOptions.tsx:25,60-72`
- `public/app/features/dashboard-scene/saving/DashboardSceneChangeTracker.ts:48,73-77`
- `pkg/api/bootdata.go:154-183,539-548`

**`@grafana/scenes` v8.13.6**

- `packages/scenes/src/querying/SceneDataTransformer.ts:208,227,265,296`
- `packages/scenes/src/components/VizPanel/VizPanel.tsx:511,547-556`
- `packages/scenes/src/components/VizPanel/VizPanelRenderer.tsx:106-115,242,325`

**`@grafana/data` 13.1.1 (installed)**

- `dist/esm/transformations/transformDataFrame.mjs:38` — the `__grafanaSceneContext`
  interpolation gate

**Branch design doc**

- `.air/plans/ad-hoc-panel-transformations.plan.md` on
  `gtk-grafana/dataviz/ad-hoc-transforms-poc__0-backend-schema` — decisions table,
  acceptance criteria 1–14, and the risks table quoted above

**This repo**

- The contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- The legacy form: [../data-plane/node-graph.md](../data-plane/node-graph.md)
- The rewrite plan and the asymmetry this doc tested:
  [graph-wide-migration.md](./graph-wide-migration.md)
- The question that started it: [relations-item-overrides.md](./relations-item-overrides.md)
- Where a wide frame currently throws: `src/lib/echarts/converters/nodeGraph.ts:355`
  (`frameToNodeGraph`), `src/lib/echarts/options/panelOption.ts:77-78`
- Where post-override data reaches the chart: `src/lib/components/Panel.tsx`
