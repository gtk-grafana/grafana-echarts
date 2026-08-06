# Splitting ad-hoc panel transformations into two initiatives

> **Status: all five PRs are still open drafts, re-checked with `gh pr view` on 2026-08-01
> (each last pushed 2026-07-29).** The stack is
> [#129542](https://github.com/grafana/grafana/pull/129542) (54 files, backend schema +
> plugin capability, base `main`) → [#129544](https://github.com/grafana/grafana/pull/129544)
> (24 files, frontend plumbing) → [#129545](https://github.com/grafana/grafana/pull/129545)
> (6 files, the `@grafana/ui` hooks) → [#129546](https://github.com/grafana/grafana/pull/129546)
> (4 files, table adoption) and [#129563](https://github.com/grafana/grafana/pull/129563)
> (19 files, logs-table adoption, branched off #129545 alongside #129546). All are
> `isDraft: true, state: OPEN`, all authored by `gtk-grafana`; the first four report
> `reviewDecision: REVIEW_REQUIRED` and #129563 has no review decision at all. The stack
> also depends on [grafana/scenes#1589](https://github.com/grafana/scenes/pull/1589)
> (`skipTransformations`), likewise an open draft.
>
> **What this doc proposes changing about the project's shape:** the stack currently
> delivers two unrelated features through one mechanism, and the second one — an
> always-on, non-persisted, plugin-declared transformation _prefix_ — is both smaller and
> a strict prerequisite for the relations family, so it should be lifted out and shipped
> first, on its own, without `skipTransformations`, without `origin`, and without a
> feature toggle.

Read [graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md) first:
it establishes the pipeline order, the thirteen gaps, and why a prefix rather than a
bypass. This doc turns its closing section into a design and a plan. Every line-numbered
claim below was re-read from source at the tag named: grafana/grafana `v13.1.0`,
`@grafana/scenes` `v8.13.6` (the version `v13.1.0`'s `package.json` resolves from
`"@grafana/scenes": "^8.2.6"`), and the PR diffs as of 2026-08-01.

## The two initiatives

**Initiative 1 — pipeline prefix registration.** A panel plugin declares a
data-conditional hook. `SceneDataTransformer.transform()` resolves the `VizPanel` it
feeds, calls the hook with the source frames, and prepends the returned
`Array<DataTransformerConfig | CustomTransformOperator>` to `interpolatedTransformations`
before the `transformDataFrame` call. Nothing persists, nothing is bypassed, no UI. The
union matters and is not a convenience — a JSON-configured prefix
[cannot express the graph conversion at all](#why-the-return-type-is-a-union-and-why-the-union-is-free),
and both downstream types already accept it.

**Initiative 2 — ad-hoc transformations.** What the five PRs already are: a user gesture
in the panel ("Hide column") adds a transformation stamped
`origin: { source: 'panel', pluginId }`, saved in the dashboard spec, visible and editable
in the Transform tab, with the panel owning pipeline execution.

| Dimension                   | Initiative 1 — pipeline prefix                                                                                                                                | Initiative 2 — ad-hoc transformations                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**                 | The shape of the incoming frames. Runs on every `transform()`, unattended                                                                                     | A user gesture in the panel body (a header menu, a field selector)                                                                                                    |
| **Persistence**             | None. Never enters `SceneDataTransformer.state.transformations`, never reaches dashboard JSON                                                                 | Persisted in the dashboard spec, in v1 and v2 (`transformSceneToSaveModelSchemaV2.ts` `getVizPanelTransformations`, #129544)                                          |
| **UI surface**              | None, by design. The user sees converted **field names**, never a transformation row                                                                          | The Transform tab row, plus whatever the panel offers to create it                                                                                                    |
| **Insertion position**      | Position 0, structurally — it is prepended inside `transform()`                                                                                               | Last (`#129545`), or straddling via `replaceAdHoc({ before, after })` (#129563)                                                                                       |
| **Who declares**            | The `PanelPlugin` object, in code, at module scope                                                                                                            | `plugin.json` (`"adHocTransforms": true`) declares _capability_; the entry itself is written at runtime from a `useEffect`                                            |
| **Override picker sees**    | **Post-conversion field names.** `PanelOptionsPane.tsx:175` reads `sceneGraph.getData(panel).useState().data`, which is now the transformer's prefixed output | **Pre-transform field names.** Under bypass the transformer's `state.data` _is_ the source, so `PanelOptions.tsx:63-66` feeds source frames to the picker             |
| **Feature toggle need**     | None. A plugin that registers no supplier is byte-identically unaffected; registering the supplier _is_ the opt-in                                            | Required while experimental. `panelAdHocTransformations`, `FeatureStageExperimental`, `Expression: "false"` (#129542, `registry.go`)                                  |
| **Blast radius**            | Exactly the panels that register a supplier — zero on day one. Non-participating panels take one extra call and one length check per `transform()`            | Keyed on plugin **id** (`panelSkipsTransformationPipeline(pluginId)`), so opting in removes the plugin from the pipeline in _every_ dashboard, for _every_ option set |
| **Depends on scenes#1589?** | **No**                                                                                                                                                        | Yes — `skipTransformations` is the mechanism                                                                                                                          |
| **Schema / CUE / Go**       | None                                                                                                                                                          | `origin` on the transformation kind across four CUE specs and six hand-written Go conversions (#129542, 23 files under `apps/dashboard`)                              |

The blast-radius row is the one that decides this for this repository.
`graph-wide-migration.md` already records why: this plugin is one plugin with one id, and
`adHocTransforms: true` would hand it the pipeline for part-to-whole, hierarchy, cartesian
and stream as well as relations, for wide input as well as legacy. A prefix is per-plugin
too, but it is _conditional on the frames_, so a family that never sees legacy graph frames
never sees the prefix.

## Why the split is cheaper than the union

Initiative 1 needs **no `skipTransformations`, no `origin` field, no schema change, no
CUE, no Go conversions, no plugin.json capability, no feature toggle, and no write that
dirties the dashboard.** That last one is not a nicety: `DashboardSceneChangeTracker`
`isUpdatingPersistedState` returns `true` for _any_ `SceneDataTransformer` partial update
whose keys are not exactly `data`
(`public/app/features/dashboard-scene/saving/DashboardSceneChangeTracker.ts:74-77`,
verified at `v13.1.0`), so **the prefix must never be written into transformer state at
all** — not as `transformations`, not as a cached supplier reference. Computing it inside
`transform()` and passing it as a local is not an optimisation, it is the requirement.

It therefore ships ahead of initiative 2 and does not wait on grafana/scenes#1589.

### Gap by gap

The rows are `graph-wide-adhoc-transformations.md`'s
["What is missing"](./graph-wide-adhoc-transformations.md#what-is-missing) table, verbatim,
with each initiative's disposition.

| Gap                                            | Initiative 1                                                                                                                                                                          | Initiative 2                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| No declarative registration                    | **Closed by construction** — it is the whole feature                                                                                                                                  | Out of scope by design; a user gesture is not declarative                                          |
| Ordering "first" is #129563-only               | **Closed by construction** — position 0                                                                                                                                               | `before` becomes unnecessary; see [the logs-table section](#migration-path-for-129563-logs-table)  |
| Position is not persisted                      | Moot — nothing persists                                                                                                                                                               | Still open, and now harmless: a user-authored entry has a position because the user put it there   |
| **Override picker reads pre-transform frames** | **Closed for free.** `PanelOptionsPane.tsx:175` → `PanelOptions.tsx:63-66` → `getFieldOverrideCategories(fieldConfig, registry, data?.series ?? [], …)` now receives converted frames | **Still open.** Nothing in the five diffs touches either call site                                 |
| Writing the pipeline dirties the dashboard     | Moot — no `setState` on the transformer                                                                                                                                               | Inherent to a persisted write, and correct for a deliberate gesture                                |
| First-paint transient                          | **Closed** — the prefix is derived inside `transform()`, on the same tick as the frames, so the panel never sees an unconverted render                                                | Still open — the entry can only be derived after frames arrive (`if (!rawTableFrame) return`)      |
| Transform-tab UX / broken editor               | Moot for the prefix; user entries keep working unchanged                                                                                                                              | #129563's own body still lists "Transform UI is broken for transformed added ad-hoc"               |
| Snapshots                                      | **Correct by construction, and it is stronger than the earlier doc claimed** — see [Downstream consumers](#every-downstream-consumer-and-whether-it-needs-work)                       | Needs the check the branch plan lists as an unmitigated risk                                       |
| Explore / bare `PanelRenderer`                 | **Still open** until two mirror changes land; they are phase 4 below                                                                                                                  | Partly, via #129563's `transformations` and `applyFieldConfig` options                             |
| `applyFieldConfig` fidelity                    | Moot — `VizPanel.applyFieldConfig` (`VizPanel.tsx:511`) runs once, in its existing place, including `featureToggles: config.featureToggles` (`:554-555`)                              | Still open: #129544's helper omits `featureToggles`, so a toggle-gated override behaviour diverges |
| Interpolation is a JSON round-trip             | Avoided by contract — prefix configs must be variable-free; see [Interpolation](#interaction-with-_interpolatevariablesintransformationconfigs)                                       | Still open, though it mirrors `SceneDataTransformer`'s own behaviour                               |
| Toggle-gated, experimental                     | Not needed                                                                                                                                                                            | By design                                                                                          |
| `rowsToFields` strips `meta`                   | Unchanged by either — recorded in [graph-wide.md](../data-plane/graph-wide.md#frame-meta)                                                                                             | Unchanged                                                                                          |

Two rows deserve emphasis because they are where the cheapness comes from.

**The prefix deletes three files' worth of scope from initiative 1.** #129544 adds
`runPanelTransformations.ts` (`isBypassedDataTransformer`, `runPanelTransformations`,
`useRunPanelTransformations`) and wires it into four consumers that would otherwise read
untransformed frames: `InspectDataTab.tsx`, `PanelDataTransformationsTab.tsx`,
`PanelDataPaneNext.tsx` and the `-- Dashboard --` datasource (`datasource.ts`, a new
`switchMap` around `withTransforms`). Under a prefix **none of that exists**, because none
of those consumers was bypassed. That is the concrete meaning of "a prefix moves the
conversion into the pipeline".

**The prefix is the only one of the two that fixes the override picker.** There is exactly
one modern call path, and it is now confirmed rather than assumed: a GitHub code search for
`getFieldOverrideCategories` across `grafana/grafana` returns four hits —
`getFieldOverrideElements.tsx` (the definition) and its test, the legacy non-scenes
`OptionsPaneOptions.tsx`, and `PanelOptions.tsx`. `PanelOptionsPane` is constructed once,
at `PanelEditor.tsx:234`, and **`PanelEditNext` renders that same object**
(`PanelEditorRendererNext.tsx:54`, `{optionsPane && <optionsPane.Component model={optionsPane} />}`).
This resolves the last open uncertainty in
[graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md#what-would-settle-the-open-uncertainties):
the new panel-edit experience has no separate override-picker path, so fixing
`PanelOptionsPane.tsx:175`'s input fixes both.

The same defect applies to #129563's extracted log fields, and it is worth stating
precisely because it is what makes initiative 1 a core concern rather than a graph-frame
concern. `useLogsTableTransformations.ts` derives `before = extractLogsFieldsTransform(rawTableFrame)`
and installs it with `replaceAdHoc({ before, after })`. Those entries run **inside the
panel**, via `useTransformedData`, on data the panel obtained from
`PanelContext.getUntransformedData`. The transformer itself is bypassed
(`skipTransformations`), so `SceneDataTransformer.state.data.series` is the source frames —
the ones with the un-exploded JSON column. `PanelOptionsPane.tsx:175` reads exactly that
object. Therefore the override editor's "Fields with name" combobox lists the source
columns and **cannot list a single extracted label field**: a user who wants a unit, a
colour or a data link on an extracted log field must hand-write the override matcher and
will never see it offered. Under a prefix the extracted fields are the transformer's
output, so they appear in the picker with no further change.

## Initiative 1: design

### The `PanelPlugin` API surface

**This is a proposal.** Nothing below exists in Grafana `v13.1.0`, in `@grafana/scenes`
`v8.13.6`, or in any of the five PRs — grepping all five diffs for a `PanelPlugin` addition
finds none. Names are negotiable; the contract clauses are the part worth arguing about.

```ts
// PROPOSAL — packages/grafana-data/src/panel/PanelPlugin.ts

/** @alpha */
export interface PanelPipelinePrefixContext<TOptions = any> {
  /** Source frames exactly as the query runner emitted them. Must not be mutated. */
  frames: DataFrame[];
  /** Current panel options, so the hook can honour an escape-hatch option. */
  options: TOptions;
}

/** @alpha */
export type PanelPipelinePrefixSupplier<TOptions = any> = (
  ctx: PanelPipelinePrefixContext<TOptions>
) => Array<DataTransformerConfig | CustomTransformOperator>;

export class PanelPlugin<TOptions = any, TFieldConfigOptions extends object = {}> {
  /** @internal — read by the host pipeline, never by the panel component. */
  pipelinePrefixSupplier?: PanelPipelinePrefixSupplier<TOptions>;

  /** @alpha */
  setPipelinePrefix(supplier: PanelPipelinePrefixSupplier<TOptions>): this {
    this.pipelinePrefixSupplier = supplier;
    return this;
  }
}
```

It is a plain field plus a chainable setter, which is exactly the shape of `setDataSupport`
(`PanelPlugin.ts:364-367`, writing to the `dataSupport` field declared at `:187-190`). That
matters for the mirror changes: `PanelModel` already reaches `this.plugin?.dataSupport` the
same way (`PanelModel.ts:608-610`), so the non-scenes path needs no new plumbing to find it.

### Why the return type is a union, and why the union is free

**A `DataTransformerConfig[]`-only supplier cannot express the graph conversion.** This is
measured, not anticipated: core's `configMapHandlers`
(`public/app/features/transformers/fieldToConfigMapping/fieldToConfigMapping.ts`, v13.1.0)
is a closed list of thirteen whose only config targets are `max`, `min`, `unit`,
`decimals`, `displayName`, `color`, `thresholds` and `mappings`. **Nothing writes
`config.custom.*` and nothing writes `config.links`**, and `rowsToFields` builds its output
frame from scratch so `meta` never survives. So every `custom.*` row of the contract's
[mapping tables](../data-plane/graph-wide.md#complete-mapping-from-graph--long),
`config.links`, and `meta.type: 'graph-edges-wide'` are unreachable through any
JSON-configured prefix. Full measurements in
[graph-wide.md](../data-plane/graph-wide.md#what-a-native-pivot-cannot-carry).

Widening the return type to `Array<DataTransformerConfig | CustomTransformOperator>` closes
that, and it costs nothing downstream, because **both types the prefix flows into already
accept the union**:

| Boundary                                    | Existing type                                                                        | Verified in                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `transformDataFrame(options, data, ctx)`    | `Array<DataTransformerConfig \| CustomTransformOperator>`                            | `@grafana/data` 13.1.1, `transformDataFrame.d.ts:12` |
| `SceneDataTransformerState.transformations` | `Array<DataTransformerConfig \| CustomTransformerDefinition>`                        | `SceneDataTransformer.ts:25`                         |
| `CustomTransformerDefinition`               | `{ operator: CustomTransformOperator; topic: DataTopic } \| CustomTransformOperator` | `scenes/src/core/types.ts:228-230`                   |

So the widening is **one type in `PanelPlugin.ts` and zero changes to `@grafana/scenes` or
`transformDataFrame`**. It makes initiative 1 cheaper rather than larger: the plugin owns
the conversion, so core does not need to grow a transformation to host it. `SceneDataTransformer`'s
own class comment already advertises the capability — _"The transformations array supports
custom (runtime defined) transformation as well as declarative core transformations."_

Six properties of custom operators decide the contract clauses below. The first five were
read from `@grafana/data` 13.1.1 `dist/esm/transformations/transformDataFrame.mjs`; the sixth
from `@grafana/scenes`:

| Observed                                                                                                            | Consequence                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `isCustomTransformation(t) => typeof t === 'function'`, tested **before** `standardTransformersRegistry` is read    | **No registry dependency**, so clause 5 does not apply to an operator entry — and the jest unmockability trap it records disappears |
| Operators are applied in array order by `stream.pipe.apply(stream, operators)`                                      | Position 0 ⇒ runs first, structurally                                                                                               |
| `if (config.disabled) continue` exists only in the non-custom branch                                                | An operator **cannot be disabled**, which is the non-user-editable requirement                                                      |
| `config.filter` / `filterInput` / `postProcessTransform` exist only in `getOperator`                                | An operator sees **every** frame and must pass non-graph frames through itself. Required anyway — the trigger is per-frame meta     |
| `ctx.interpolate` / `deepIterate` run only in `getOperator`; the operator still **receives** `context`              | **Clause 3 is moot for an operator** — a closure has no config literals to interpolate, and can call `ctx.interpolate` explicitly   |
| A bare function falls through the `'options' in t \|\| 'topic' in t` predicate at `SceneDataTransformer.ts:270-272` | Defaults to the series topic. **Clause 4 is automatic**, not a lint rule                                                            |

And the property that matters most for the stated goal: **a function cannot round-trip
dashboard JSON**, so an operator prefix is non-persistable and non-editable _structurally_,
enforced by the type rather than by the "nothing persists" convention.

One side effect to record. A function in the array flips
`_interpolateVariablesInTransformationConfigs` off its `onlyObjects` fast path
(`SceneDataTransformer.ts:372`) onto the per-item path at `:379-385`. User configs are
interpolated identically, one at a time; it also sidesteps the whole-array `JSON.stringify`
mangling that [graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md)
lists as a gap. But it is a code-path change for every panel that registers a prefix **and**
uses variables, so it belongs in the acceptance tests.

For the relations family the registration is:

```ts
// This repo, PROPOSED usage — src/module.ts
plugin.setPipelinePrefix(({ frames, options }) =>
  options.dataFormat === 'legacy' || (options.dataFormat === 'auto' && isNodeGraphFrames(frames))
    ? [legacyToWideOperator]
    : []
);
```

`legacyToWideOperator` is a one-line wrapper over the pure adapter the migration plan
already calls for, so the two are not alternatives:

```ts
export const legacyToWideOperator: CustomTransformOperator = () => (source) => source.pipe(map(legacyToWide));
```

`options` is in the context specifically so the `dataFormat: 'auto' | 'legacy' | 'wide'`
escape hatch that [graph-wide-migration.md](./graph-wide-migration.md#the-dataformat-panel-option)
already specifies can drive it, and so the relations family's endpoint-label-key options can
reach the emitted config. A signature taking only `frames` would force a second mechanism
for both.

**Contract clauses, all of which are proposals:**

1. **Pure and synchronous.** It runs once per `transform()` call, on the same tick as the
   frames. No promises, no observables, no `setState`.
2. **`[]` is the no-op and the common case.** Returning an empty array must leave the
   pipeline byte-identical to today, including preserving `data.series` identity when the
   user has no transformations either — that is what keeps `VizPanel.applyFieldConfig`'s
   memo (`VizPanel.tsx:525-538`, keyed on `_prevData.series === rawData.series`) intact.
3. **Configs must be variable-free.** No `$var`, `${var}` or `[[var]]`. See
   [interpolation](#interaction-with-_interpolatevariablesintransformationconfigs); a plugin
   that needs an interpolated value should read it from `options`. **Applies to
   `DataTransformerConfig` entries only** — an operator has no config literals, and receives
   `ctx` if it wants interpolation.
4. **Configs must not set `topic`.** The host runs the prefix on the series topic only. For
   operator entries this is automatic: a bare function fails the
   `'options' in t || 'topic' in t` test at `SceneDataTransformer.ts:270-272` and is kept for
   series, excluded from annotations. Pass a bare `CustomTransformOperator`, not the
   `{ operator, topic }` form.
5. **`id` must resolve in the host's `standardTransformersRegistry`.** A prefix naming a
   transformer the host lacks surfaces through the existing `catchError`
   (`SceneDataTransformer.ts:319-345`) as `Error transforming data: …`, which is the right
   failure mode but should be documented as such. Note the trap this repo already
   measured: `rowsToFields` ships **only** as an id constant in `@grafana/data`; the
   implementation lives in Grafana core app code, so a prefix naming it works in a host and
   is unmockable-by-registration under jest. **This clause is the argument for preferring an
   operator**: `transformDataFrame` dispatches functions before it ever consults the
   registry, so an operator entry has no host-version coupling and is directly unit-testable.
6. **An operator must pass through what it does not own.** Custom entries bypass
   `config.filter`, `filterInput` and `postProcessTransform`, so the operator receives every
   frame in the response and is responsible for returning non-matching frames unchanged —
   including preserving their identity, so clause 2's memo still holds when nothing converts.

### Where exactly it is called in `SceneDataTransformer.transform()`

Line numbers are `@grafana/scenes` `v8.13.6`, `packages/scenes/src/querying/SceneDataTransformer.ts`.

```ts
private transform(data: PanelData | undefined, force = false) {           // :208
  // … profiler locals, :209-225, unchanged …

  // :227 today reads:
  //   if (this.state.transformations.length === 0 || !data) { … return; }
  // It must split, because a legacy node-graph dashboard has ZERO user
  // transformations and would otherwise return before the prefix is ever consulted.
  if (!data) {
    this._prevDataFromSource = data;                                       // :228-234
    this.setState({ data });
    return;
  }

  const prefix = getPipelinePrefixFor(this, data);                         // NEW

  if (prefix.length === 0 && this.state.transformations.length === 0) {
    this._prevDataFromSource = data;                                       // :228-234, verbatim
    this.setState({ data });
    this._results.next({ origin: this, data });
    return;
  }

  if (!force && this.haveAlreadyTransformedData(data)) { return; }         // :238, unchanged
  // … profiler start, :242-263, unchanged …

  const interpolatedTransformations =
    this._interpolateVariablesInTransformationConfigs(data);               // :265, unchanged
  const allTransformations = [...prefix, ...interpolatedTransformations];  // NEW

  const seriesTransformations =
    this._filterAndPrepareTransformationsByTopic(allTransformations, …);   // :267, arg changed
  const annotationsTransformations =
    this._filterAndPrepareTransformationsByTopic(allTransformations, …);   // :276, arg changed

  // … :286-294 unchanged …
  const seriesStream = transformDataFrame(seriesTransformations, data.series, ctx); // :296
  // … :297-360 unchanged …
}
```

Three properties fall out of that placement and are worth stating because each removes a
follow-up:

- **The topic filters need no change, for configs or for operators.**
  `_filterAndPrepareTransformationsByTopic` (`:386-393`) keeps a config for the series topic
  when `transformation.topic == null` (`:271`) and for annotations only when it equals
  `DataTopic.Annotations` (`:280`). Both predicates are guarded by
  `'options' in transformation || 'topic' in transformation`, so a **bare function** fails the
  guard, falls through to the series branch, and is excluded from annotations — and its
  `'operator' in transformation` unwrap at `:393` is a no-op. A prefix config with no `topic`
  behaves the same way, which is why clause 4 is a lint rule for configs and automatic for
  operators.
- **`ctx.interpolate` (`:290-294`) is untouched**, so a prefixed transformation that _reads_
  interpolated values through the context behaves like any other. Only the config's own
  literals are un-interpolated.
- **The error path is shared.** `catchError` at `:319-345` already turns a throwing
  transformation into `LoadingState.Error` plus a `transformationError`, so a broken prefix
  degrades exactly like a broken user transformation.

### How the plugin is reached

Mirror #129544's `syncSkipTransformationsBehavior`
(`public/app/features/dashboard-scene/scene/adHocTransformations.ts`), which resolves the
panel as:

```ts
const panel = transformer.parent;
if (!(panel instanceof VizPanel)) {
  return;
}
// … vizPanel.getPlugin() …
```

Two adaptations are needed, and both are constraints rather than preferences.

**Use `transformer.parent`, not `sceneGraph.getAncestor`.** The strict check is deliberate:
`SceneDataTransformer.getSourceData()` (`:74-87`) permits a transformer whose `$data` is
another transformer, and an ancestor walk from the inner one would find the same `VizPanel`,
so both would prepend the prefix and the conversion would run twice. `transformer.parent`
is `VizPanel` for exactly one transformer in the chain, which is the one the panel reads.

**The import cycle is already precedented, so put the lookup in its own module.**
`SceneDataTransformer.ts` does not import `VizPanel` today, and `VizPanel.tsx:42` imports
`SceneDataTransformer`, so a direct import would be a new cycle. But
`SceneDataTransformer.ts:19` already imports `utils/findPanelProfiler`, and
`findPanelProfiler.ts:3` imports `VizPanel` — the cycle exists and works, because the
reference is only dereferenced inside a function body. A sibling
`packages/scenes/src/utils/getPipelinePrefixFor.ts` following the identical shape is
therefore the low-risk placement.

**The plugin-load race is the one genuinely hard part.** `SceneObjectBase._internalActivate`
(`core/SceneObjectBase.tsx:240-268`) runs the object's own activation handlers at `:245`
_before_ activating `$data` at `:260-262`. So `VizPanel._onActivate` (`VizPanel.tsx:184-188`)
calls `_loadPlugin` first — but `_loadPlugin` is `async` (`:195`), and `getPlugin()`
(`:350-352`) returns `this._plugin`, which is assigned only at `:329`, inside
`_pluginLoaded`. Meanwhile `SceneDataTransformer.activationHandler` calls
`this.transform(sourceData.state.data)` synchronously if source data is already present
(`:63-65`). **Whenever data is already there — a snapshot dashboard, a `SceneDataNode`, a
cached query result, a repeat clone that inherited `_prevDataFromSource` (`:151-159`) — the
first `transform()` runs with `getPlugin() === undefined` and silently skips the prefix.**

The fix is a reprocess trigger, and the signal exists: `_pluginLoaded` assigns
`this._plugin` at `:329` and immediately calls
`this.setState({ $data, options, fieldConfig, pluginVersion, pluginId })` at `:331-337`, so
a `subscribeToState` on the parent panel fires on the next tick after the plugin becomes
available. Add to `SceneDataTransformer.activationHandler` (`:58-72`), next to the existing
`sourceData.subscribeToState` at `:61`:

```ts
// PROPOSAL
const panel = this.parent;
if (panel instanceof VizPanel) {
  let hadPlugin = Boolean(panel.getPlugin());
  let lastPluginId = panel.state.pluginId;
  this._subs.add(
    panel.subscribeToState((next) => {
      const hasPlugin = Boolean(panel.getPlugin());
      if (hasPlugin !== hadPlugin || next.pluginId !== lastPluginId) {
        hadPlugin = hasPlugin;
        lastPluginId = next.pluginId;
        this.reprocessTransformations(); // :104-106 → transform(data, force = true)
      }
    })
  );
}
```

`reprocessTransformations()` passes `force = true`, which bypasses the
`haveAlreadyTransformedData` memo at `:238` — necessary, because the frames have not
changed. Using `getPlugin()` truthiness rather than a dedicated event is a proxy; a
dedicated `pluginLoaded` signal on `VizPanel` would be cleaner and is listed as an open
question. As a side effect this also repairs a latent case unrelated to the prefix:
`_pluginLoaded` can rewrite the transformer's own array
(`VizPanel.tsx:310-320`, `$data.setState({ transformations: panel.transformations })`, for
panels that mutate transformations during migration), and in `v8.13.6` nothing re-runs
`transform()` after that — the transformer subscribes only to its source, never to its own
state.

### Memoization and re-run semantics

The prefix is computed on every `transform()` call, and `transform()`'s existing memo is
already at the right granularity. `haveAlreadyTransformedData` (`:169-206`) returns `true`
when `data === this._prevDataFromSource`, or when `data.series` and `data.annotations` are
both reference-identical — in which case it re-publishes metadata only (`:189-199`). Since
the hook's only data input is `data.series`, that is exactly the condition under which the
prefix cannot have changed.

| Trigger                                            | Prefix re-derived?             | Why                                                                                                      |
| -------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| New query response                                 | **Yes**                        | `data.series` identity changes, so `:180` fails and the full path runs                                   |
| Metadata-only emission (loading state, errors, tz) | No                             | `:180-200` short-circuits and re-publishes; the previous prefixed output is kept                         |
| Panel plugin finishes loading                      | Only with the new subscription | `getPlugin()` is an instance field, not state                                                            |
| Viz type change                                    | Only with the new subscription | `pluginId` changes; `data.series` does not                                                               |
| Panel option change (e.g. `dataFormat`)            | Only with the new subscription | `options` is `VizPanel` state, invisible to the transformer                                              |
| User edits the Transform tab                       | **Yes**                        | `PanelDataTransformationsTab.onChangeTransformations` (`:74-78`) calls `reprocessTransformations()`      |
| Variable referenced by a **user** transformation   | **Yes**                        | `_variableDependency` with `statePaths: ['transformations']` (`:44-50`) calls `reprocessTransformations` |
| Variable referenced only by a **prefix** config    | **No**                         | `_variableDependency` scans `state.transformations`, which never holds the prefix — hence clause 3       |

Two consequences. First, the subscription above must also fire on option changes, so keying
it on `pluginId` alone is not enough; the cheapest correct version reprocesses on any parent
state change other than a bare `_renderCounter` bump, mirroring the discrimination
`DashboardSceneChangeTracker.isUpdatingPersistedState` already makes at `:62-66`. Second, no
memoization inside the hook is required of the plugin, but the hook is on the render-blocking
path, so a plugin doing a full frame walk should cache on `frames` identity itself.

### Interaction with `_interpolateVariablesInTransformationConfigs`

The prefix is prepended **after** the `:265` call, deliberately, and the reason is a verified
behaviour rather than a preference. `_interpolateVariablesInTransformationConfigs`
(`:363-384`) returns `this.state.transformations` **verbatim and un-interpolated** when
`this._variableDependency.getNames().size === 0` (`:368-370`), and that dependency set is
computed from `statePaths: ['transformations']` (`:47`) — the user's array only. So if the
prefix were spliced in before the call:

- when no user transformation references a variable, the prefix would not be interpolated;
- when some user transformation _does_, the prefix would be interpolated, through the
  `JSON.parse(sceneGraph.interpolate(this, JSON.stringify(transformations), …))` round trip
  at `:376`.

That is a behaviour that depends on unrelated dashboard content, which is worse than not
interpolating at all. Prepending after `:265` makes it unconditional and documentable
(clause 3), and it also keeps the prefix out of the `$`/`[[` JSON round trip that
`graph-wide-adhoc-transformations.md` flags as able to mangle a field name containing `$`.

If a prefix genuinely needs a variable value later, the additive answer is to interpolate
the prefix separately with an explicit `sceneGraph.interpolate` on the returned configs, and
to extend `_variableDependency` to scan them — both strictly more work than clause 3, and
neither needed by the graph case.

### The mirror change for Explore and bare `PanelRenderer`

`SceneDataTransformer` is not the only place the pipeline runs, and the prefix is incomplete
without both mirrors.

**`PanelQueryRunner.applyTransformations`** (`public/app/features/query/state/PanelQueryRunner.ts:222-228`)
takes the same shape of change. It reads
`this.dataConfigSource.getTransformations()` and returns early when the array is empty or
all-disabled (`:225-228`), then calls `transformDataFrame` at `:237`. `DataConfigSource`
(`packages/grafana-data/src/types/data.ts:211-217`) is implemented by `PanelModel`, which
already holds `plugin?: PanelPlugin` (`PanelModel.ts:203`) and already delegates
capabilities through it (`getDataSupport()`, `:608-610`). So:

- add `getPipelinePrefix?: (frames: DataFrame[]) => Array<DataTransformerConfig | CustomTransformOperator>`
  to `DataConfigSource` (**proposal**);
- implement it on `PanelModel` as `this.plugin?.pipelinePrefixSupplier?.({ frames, options: this.options }) ?? []`;
- split the `:226` guard the same way as scenes' `:227` and prepend before `:234`'s topic split.

`new PanelQueryRunner` occurs in exactly one production site,
`PanelModel.getQueryRunner()` (`:612-614`), so the reach is bounded.

**`PanelRenderer`** (`public/app/features/panel/components/PanelRenderer.tsx`) is the harder
one, because it has **no transformation step at all**: it goes from
`useOptionDefaults` (`:41`) straight to
`useFieldOverrides(plugin, …, data, …)` (`:42`) and hands `dataWithOverrides` to the panel at
`:99`. Adding the prefix there means adding an async stage before field overrides — the same
job `useTransformedData` does in #129545, and the reason `transformPanelData`
(`packages/grafana-data/src/transformations/transformPanelData.ts`, new in #129544) is worth
keeping from the existing stack even under the split. `PanelRenderer` already resolves the
plugin itself (`syncGetPanelPlugin` at `:39`, `importPanelPlugin` at `:51`), so the supplier
is in hand.

This is not a marginal host. `PanelRenderer` is used by Explore's
`TableContainer.tsx`, `ExploreGraph.tsx` and `CustomContainer.tsx`, by the alerting rule
preview (`PreviewRuleResult.tsx`), and by the visualization-suggestion cards
(`VisualizationSuggestionCard.tsx`). Explore's table is precisely the logs-table case, and
the suggestion cards are precisely where a graph-frame suggestion would have to render.
Until this mirror lands, the prefix works in dashboards and not in Explore — which should be
stated in the PR rather than discovered.

### Every downstream consumer, and whether it needs work

| Consumer                                                                                        | Under a prefix                                                                                                                                                                                                                                                                                                         | Needs work?                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Override picker** (`PanelOptionsPane.tsx:175` → `PanelOptions.tsx:63-66`)                     | Reads the transformer's output, which is now the converted frames. This is the point of the feature                                                                                                                                                                                                                    | **No — correct by construction**       |
| **`VizPanel.applyFieldConfig`** (`VizPanel.tsx:511-556`)                                        | Runs once, in place, over post-prefix frames, with the full argument set including `featureToggles` (`:554-555`). No second pass, no wasted pass                                                                                                                                                                       | **No**                                 |
| **Panel inspect — data** (`InspectDataTab.tsx`)                                                 | `getDataProviderToSubscribeTo` (`:83-89`) already returns the transformer for `withTransforms: true` and its `$data` for `false`, so both readings are right                                                                                                                                                           | **No**                                 |
| **Panel inspect — the toggle's visibility**                                                     | `hasTransformations(dataProvider)` (`:75-81`) is `state.transformations.length > 0`, which is `0` for a prefix-only panel, so "Apply panel transformations" is not offered even though the two views differ                                                                                                            | **Yes — small.** Count the prefix      |
| **Transform tab, per-row previews**                                                             | `TransformationOperationRows` receives `data` from `model.getDataTransformer().useState()` (`PanelDataTransformationsTab.tsx:84,281`) and each row re-runs `transformDataFrame(configs.slice(0, index), data.series)` (`TransformationOperationRow.tsx:119-135`), so row 0's input already shows converted field names | **No** (see the caveat below)          |
| **Transform tab, the empty state / picker**                                                     | `TransformationsEditor` gets `sourceData.data` — the query runner's output (`PanelDataTransformationsTab.tsx:176`), i.e. **pre**-prefix names                                                                                                                                                                          | **Yes — small.** An inconsistency      |
| **Snapshots** (`transformSceneToSaveModel.ts:342-359`)                                          | For a `SceneDataTransformer`, `:346-349` already snapshots `dataProvider.state.$data!.state.data` — the **pre**-transform frames — and `:339` writes `panel.transformations`. The prefix is not in that array, so on load the plugin re-derives it from the snapshotted source frames and reproduces the same output   | **No — correct by construction**       |
| **`-- Dashboard --` datasource** (`datasource.ts:87-91`)                                        | `withTransforms: true` subscribes to the `SceneDataTransformer`, hence post-prefix; `false` subscribes to `state.$data`, hence the raw query frames. Both readings are defensible and neither needs #129544's `switchMap`                                                                                              | **No**                                 |
| **Dirty tracking** (`DashboardSceneChangeTracker.ts:74-77`)                                     | Nothing is written to transformer state, so no dashboard is dirtied on open                                                                                                                                                                                                                                            | **No — provided the rule is honoured** |
| **Save model** (`transformSceneToSaveModel.ts:338-340`, `transformSceneToSaveModelSchemaV2.ts`) | `panel.transformations` is `state.transformations`, which never contains the prefix, so JSON is unchanged                                                                                                                                                                                                              | **No**                                 |
| **Explore, alert previews, suggestion cards** (`PanelRenderer.tsx:42,99`)                       | No transformation stage exists                                                                                                                                                                                                                                                                                         | **Yes — phase 4**                      |
| **Legacy non-scenes pipeline** (`PanelQueryRunner.ts:222-237`)                                  | Guard returns early on an empty user array                                                                                                                                                                                                                                                                             | **Yes — phase 4**                      |

The Transform-tab caveat, stated honestly: `TransformationOperationRow` builds its input by
re-running `configs.slice(0, index)` starting from the **transformer's output**, not from the
source, which double-applies the user's own transformations in the preview. That is a
pre-existing quirk in `v13.1.0`, independent of this work; the prefix neither causes it nor
makes it worse, and it is why row 0's input happens to show the converted names.

## Initiative 1: PoC implementation plan

Ordered so that each phase is independently reviewable and each leaves the tree working.
Phase 1 is inert on its own; phase 2 is the only behavioural change; phases 3–5 widen it.

### Phase 1 — the hook, unwired (`grafana/grafana`, `@grafana/data`)

1. `PanelPipelinePrefixContext`, `PanelPipelinePrefixSupplier`, the
   `pipelinePrefixSupplier` field and `setPipelinePrefix` —
   `packages/grafana-data/src/panel/PanelPlugin.ts`, adjacent to `setDataSupport` (`:364`).
   Export the types from `packages/grafana-data/src/index.ts`.
2. Doc comments carrying all five contract clauses verbatim, because clauses 3 and 4 are
   unenforceable at the type level.

A plugin can register a supplier after this phase and nothing happens. That is the point:
it can merge before any host consumes it.

### Phase 2 — execution in scenes (`grafana/scenes`)

3. `packages/scenes/src/utils/getPipelinePrefixFor.ts` — new module resolving
   `transformer.parent instanceof VizPanel` → `getPlugin()?.pipelinePrefixSupplier`,
   returning `[]` on every miss. Same module shape as `utils/findPanelProfiler.ts:1-22`,
   which already carries the `VizPanel` import that `SceneDataTransformer.ts:19` depends on.
4. `SceneDataTransformer.transform()` — split the `:227` guard into the two guards sketched
   above and prepend the prefix to `interpolatedTransformations` after `:265`. Nothing else
   in the method moves.
5. `SceneDataTransformer.activationHandler` (`:58-72`) — subscribe to the parent `VizPanel`
   and `reprocessTransformations()` when the plugin appears, the `pluginId` changes, or the
   options change; ignore a bare `_renderCounter` update.
6. Tests in `SceneDataTransformer.test.ts`: a prefix runs with **zero** user transformations
   (this is the `:227` regression that would otherwise ship silently); prefix-then-user
   ordering; a prefix is excluded from the annotations topic; `[]` preserves
   `state.data.series === source.series` identity; a prefix registered on a plugin that
   loads late is applied after `reprocessTransformations`; a chained transformer applies it
   once.
7. Release as `@grafana/scenes` 8.14.0. **Independent of grafana/scenes#1589** — it touches
   the same `:227` guard, so the two want sequencing, but neither needs the other.

### Phase 3 — wiring and the first in-tree consumer (`grafana/grafana`)

8. Bump `@grafana/scenes`. Note what is _absent_: unlike #129544, which had to set
   `skipTransformations` at five `new SceneDataTransformer` sites plus a `$behaviors` sync
   (`createPanelDataProvider.ts`, `layoutSerializers/utils.ts`, and three more), **no call
   site changes**, because the transformer finds the plugin itself.
9. `hasTransformations` (`InspectDataTab.tsx:75-81`) — include the prefix so panel inspect
   keeps offering "Apply panel transformations".
10. `TransformationsEditor`'s `data` prop (`PanelDataTransformationsTab.tsx:176`) — pass the
    transformer's output rather than `sourceData.data`, so the "add your first
    transformation" picker names the same fields the rows do.
11. First consumer: the logs table's `extractFields`. Register
    `extractLogsFieldsTransform` as a prefix on the logstable plugin, deleting `before` and
    `replaceAdHoc({ before, after })` from `useLogsTableTransformations.ts` — see
    [the logs-table section](#migration-path-for-129563-logs-table).

### Phase 4 — the non-scenes mirrors (`grafana/grafana`)

12. `DataConfigSource.getPipelinePrefix?` — `packages/grafana-data/src/types/data.ts:211-217`;
    implemented on `PanelModel` (`public/app/features/dashboard/state/PanelModel.ts`,
    following `getDataSupport` at `:608-610`); consumed in
    `PanelQueryRunner.applyTransformations` (`:222-237`) with the same guard split.
13. `PanelRenderer` (`public/app/features/panel/components/PanelRenderer.tsx`) — a
    transformation stage before `useFieldOverrides` (`:42`), built on `transformPanelData`.
    This is what makes the prefix real in Explore (`TableContainer.tsx`,
    `ExploreGraph.tsx`, `CustomContainer.tsx`), alert previews
    (`PreviewRuleResult.tsx`) and suggestion cards (`VisualizationSuggestionCard.tsx`).

### Phase 5 — documentation

14. One page under `docs/sources/developers/plugins/`, stating plainly what the prefix is
    not: it does not give a panel a transformation UI, it is not persisted, and it is not a
    substitute for a user-authored transformation when the user should be able to see and
    edit the reshaping.

### Acceptance criteria

| #   | Criterion                                                                                                                                                                                                                                                                                                                                                                                                      | How                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | A panel with a registered prefix and an **empty** `transformations` array receives converted frames. This is the `:227` guard, and it is the criterion the whole feature stands on                                                                                                                                                                                                                             | unit (scenes)        |
| 2   | A panel with **no** supplier is unaffected: `state.data.series` is reference-identical to the source, and `VizPanel.applyFieldConfig`'s memo (`VizPanel.tsx:525-538`) still short-circuits                                                                                                                                                                                                                     | unit (scenes)        |
| 3   | A supplier returning `[]` behaves identically to criterion 2 — the no-op path is the one every non-legacy dashboard takes                                                                                                                                                                                                                                                                                      | unit (scenes)        |
| 4   | Prefix entries run before user entries, and never against annotation frames                                                                                                                                                                                                                                                                                                                                    | unit (scenes)        |
| 5   | A prefix on a plugin that resolves **after** the transformer's first `transform()` is still applied — construct a `SceneDataTransformer` over a `SceneDataNode` that already has data, activate, resolve the plugin, assert the converted output                                                                                                                                                               | unit (scenes)        |
| 6   | **Browser.** On an unmodified dashboard whose panel runs a legacy TestData `node_graph` query, open the panel editor and **+ Add field override → Fields with name**: the combobox lists **node and edge ids**, not `id` / `source` / `target` / `mainstat`. With the supplier unregistered the same combobox lists the four legacy column names. The code path is unambiguous; the rendered list is the claim | Playwright / by hand |
| 7   | **Browser.** Open that same dashboard, change nothing, wait for the converted render: no unsaved-changes indicator, and the Panel JSON tab shows `transformations` unchanged (absent for a legacy dashboard)                                                                                                                                                                                                   | Playwright / by hand |
| 8   | **Browser.** A `byName` override authored from criterion 6's picker against a node id applies, survives save + hard reload, and does not render as `(not found)`                                                                                                                                                                                                                                               | Playwright / by hand |
| 9   | A snapshot of a prefixed panel, saved and reopened, renders converted frames — proving `transformSceneToSaveModel.ts:346-349`'s pre-transform snapshot plus re-derivation is sufficient                                                                                                                                                                                                                        | integration          |
| 10  | The same legacy query renders converted in Explore's table (phase 4)                                                                                                                                                                                                                                                                                                                                           | integration          |

Criterion 6 is the exit criterion `graph-wide-migration.md` phase 0 already names — _"a
legacy node-graph query, on an unmodified dashboard, produces an override picker listing
node and edge names"_ — and it is worth running against the real editor rather than a unit
test, because it is the assertion that the whole release gate rests on.

## What initiative 2 keeps, and what it should drop

### The five PRs, split

| PR          | Contents                                                                                                                                                                                             | Initiative                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#129542** | `panelAdHocTransformations` toggle; `origin` on the transformation kind across four CUE specs; six Go conversions; `adHocTransforms` capability                                                      | **All initiative 2.** Initiative 1 needs none of the 54 files                                                                                                                                                    |
| **#129544** | `transformPanelData`; `PanelPluginMeta.adHocTransforms`; five `PanelContext` members; `adHocTransformations.ts`; `runPanelTransformations.ts`; `origin` serialisation; four bypass-repair call sites | **Initiative 2**, except `transformPanelData` (shared — initiative 1's `PanelRenderer` mirror wants it) and `syncSkipTransformationsBehavior`'s parent-resolution shape (the template for initiative 1's lookup) |
| **#129545** | `useAdHocTransformations`, `useTransformedData`, last-only `replaceAdHoc`                                                                                                                            | **All initiative 2** — and its last-only `replaceAdHoc` is the shape to keep                                                                                                                                     |
| **#129546** | `"adHocTransforms": true` on table; `HeaderCell` "Hide column"; one-line `TablePanel` adoption                                                                                                       | **All initiative 2, and it is the feature's best justification** — a user gesture that should persist and be editable                                                                                            |
| **#129563** | `AdHocTransformationPositions`; `splitTrailing` / `runPipeline`; local-state fallback; logstable adoption                                                                                            | **Split.** `extractFields` → initiative 1; `organize` → see below; `splitTrailing` → drop; local-state fallback → initiative 2                                                                                   |

### The six named APIs

| API                               | Where                                     | Initiative 1                                                                                                    | Initiative 2                                                                             | Verdict                                                                                           |
| --------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `skipTransformations`             | `SceneDataTransformerState` (scenes#1589) | **Not needed.** The pipeline is never bypassed                                                                  | **Required** — it _is_ the bypass                                                        | **Initiative 2 only.** Initiative 1 does not depend on grafana/scenes#1589                        |
| `getUntransformedData`            | `PanelContext` (#129544)                  | **Not needed** — the panel receives post-prefix, post-override data as usual                                    | **Required** — the only way a bypassed panel reaches its source                          | Initiative 2 only                                                                                 |
| `applyFieldConfig`                | `PanelContext` (#129544)                  | **Not needed** — `VizPanel.applyFieldConfig` (`VizPanel.tsx:511`) already runs after the prefix, once, in place | **Required**, and still needs `featureToggles` added to reach parity with `:554-555`     | Initiative 2 only                                                                                 |
| `useTransformedData`              | `@grafana/ui` (#129545, extended #129563) | **Not needed** in a dashboard. Its `transformPanelData` core is reusable for the `PanelRenderer` mirror         | **Required** — it is how a bypassed panel restores the ordering                          | Initiative 2 only; the hook survives, the graph case never calls it                               |
| `replaceAdHoc({ before, after })` | `useAdHocTransformations` (#129563)       | **Not needed** — position 0 is structural, not a parameter                                                      | `after` is what a persisted user gesture wants; `before` exists only for `extractFields` | **Revert to #129545's array form.** `AdHocTransformationPositions` goes away with `extractFields` |
| `splitTrailing` / `runPipeline`   | `useTransformedData` (#129563)            | Not needed                                                                                                      | Not needed **if** logstable's `organize` stays in the panel, where it was before #129563 | **Drop from both.** It exists only because `organize` was moved into the shared pipeline          |

Two smaller items, for completeness. `withEditorOrigin` (#129544) is initiative 2 only —
without `origin`, nothing needs stamping. And `runPanelTransformations` /
`isBypassedDataTransformer` / `useRunPanelTransformations` (#129544) are initiative 2 only,
which is the largest single deletion the split buys: three functions, one new file, and four
consumers repaired in #129544 that initiative 1 never breaks.

## Migration path for #129563 (logs table)

The PR's own body flags the ordering requirement — _"the additional pipeline was
required to get the extracted fields before organize fields is applied"_ — and
`useLogsTableTransformations.ts` implements it as
`extractFields -> (whatever the user added) -> organize`, via
`replaceAdHoc({ before, after })`. Under the split the two ends separate cleanly, because
they are not the same kind of thing.

| Piece                                                                       | What it is                                                                                                                                                          | Under the split                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `before = extractLogsFieldsTransform(rawTableFrame)`                        | Data-shape derived, no user gesture, must run first, should be invisible. Textbook initiative 1                                                                     | **An initiative-1 prefix.** `plugin.setPipelinePrefix(({ frames }) => …)`. Deletes the `before` memo, the `useEffect` write, and the `pipelineKey` reconciliation for it |
| `after = organizeLogsFieldsTransform(indexByName, includeByName)`           | Derived from `options.displayedFields` — a **panel option**, not a transformation. Must run last, and the panel needs the pre-organize frame for its field selector | **Stays in the panel**, i.e. restore `useOrganizeFields.tsx` (deleted in #129563). Then `splitTrailing` has nothing to split                                             |
| `splitTrailing` + `runPipeline` + `dataBeforeTrailing`                      | Machinery so a panel can see the intermediate stage                                                                                                                 | **Unnecessary.** `availableFieldsFrame` is just the pipeline output again, which is what `useOrganizeFields` consumed before                                             |
| `AdHocTransformationPositions` (`{ before, after }`)                        | Position API                                                                                                                                                        | **Unnecessary.** Revert `replaceAdHoc` to #129545's array form                                                                                                           |
| The local-state fallback in `useAdHocTransformations`                       | Lets a panel hold a pipeline in hosts with no `PanelContext`                                                                                                        | **Keep, initiative 2.** Independent of ordering                                                                                                                          |
| The panel's own `applyFieldConfig` (its registry + synthesized `custom.*`)  | Genuinely panel-specific                                                                                                                                            | **Keep**, and it stays the panel's business either way                                                                                                                   |
| Whatever user-initiated bits logstable grows (a "hide this column" gesture) | User gesture, should persist                                                                                                                                        | **Initiative 2**, exactly like #129546's table                                                                                                                           |

Net effect on the PR: it loses `AdHocTransformationPositions`, `splitTrailing`,
`runPipeline`, `dataBeforeTrailing`, the `before` derivation and its reconciliation
`useEffect`, and gains one `setPipelinePrefix` call plus the restored `useOrganizeFields`.
It also **gains** the thing it does not have today — extracted log fields that appear in the
override picker, so a user can set a unit or a colour on one from the UI.

The `organize` disposition is the one judgement call here, and it should be argued rather
than assumed. Leaving it in the panel is cheaper (it deletes `splitTrailing` outright) and it
is where it lived before #129563; moving it into a shared pipeline is what made the panel
fight the user for array ownership in the first place — `useLogsTableTransformations`
rewrites the whole array whenever a row is dragged past its entries. If a future consumer
genuinely needs both ends, the additive change is to widen the initiative-1 hook's return to
`{ before?, after? }`, which is a strictly larger version of the same design and can be done
later without breaking a prefix-only signature.

## Risks and open questions

**The `:227` guard change touches every panel in every dashboard.** It is one extra function
call and one `length` check on a path that runs on every query response, and the pass-through
body is copied verbatim, but the regression surface is "all of Grafana". Criteria 2 and 3
exist for this. A `config.featureToggles` gate around the guard itself is cheap insurance and
would not change the argument that initiative 1 needs no _user-facing_ toggle.

**The plugin-load race is mitigated by a proxy signal, not a real one.** `getPlugin()`
becoming non-`undefined` is observed indirectly, through the `setState` at
`VizPanel.tsx:331-337`. That is reliable in `v8.13.6` but it is a coupling to an
implementation detail. The clean fix is a dedicated signal — either a `pluginLoaded` event or
moving plugin readiness into `VizPanel` state — and it should be raised with the scenes
maintainers rather than worked around indefinitely.

**Reprocessing on parent option changes may be too eager.** Options change on every editor
keystroke in the panel-options pane. Reprocessing calls `transform(data, force = true)`,
which skips the memo and re-runs the whole pipeline plus `applyFieldOverrides`. Some
discrimination is needed — either the hook declares which option paths it reads, or the host
compares the previous prefix against the new one and only reprocesses on a change. The
second is cheaper and needs no API, but it does mean caching the last prefix somewhere that
is not transformer state (an instance field, like `_prevDataFromSource`).

**Prefix-only panels lose the inspect toggle.** Named above with the one-line fix, but it
generalises: several places in core ask "does this panel have transformations?" as a proxy
for "is the pipeline doing anything?", and a prefix makes those two questions diverge.
`hasTransformations` is the one found by reading `v13.1.0`; there may be others, and a
`hasPipelinePrefix()`-style helper would be better than patching each.

**Whether a prefix should be able to reshape annotations.** Clause 4 says no, on the grounds
that the graph and logs cases only reshape series and that `_filterAndPrepareTransformationsByTopic`
already gives that for free. Not argued from a requirement, so it may be wrong.

**The `-- Dashboard --` datasource's `withTransforms: false` semantics.** A chained panel with
the switch off receives the raw legacy long frames — a shape the source panel never renders.
That is arguably correct ("raw query results") and arguably surprising. Not determinable from
the code; it needs a product call.

**Could not determine from the code:** whether `VizPanel.setState` inside `_pluginLoaded`
always emits (it constructs fresh `options` / `fieldConfig` objects via
`getPanelOptionsWithDefaults`, so in practice yes, but scenes' `setState` short-circuit
behaviour was not traced); how repeat clones behave on the prefix path, since
`SceneDataTransformer.clone` copies `_prevDataFromSource` (`:151-159`) and the clone's
`parent` is rebound afterwards; and whether any host other than the five found for
`PanelRenderer` and the one for `PanelQueryRunner` runs a pipeline (the alerting and
reporting/PDF paths were not traced). Also unmeasured: the per-render cost of a
`rowsToFields`-shaped prefix on a realistic topology — this repo's own contract measures the
pivot itself at 0.3 ms for the matrix shape and ~19 ms for edge-per-field at 5 000 marks, but
not through `transformDataFrame` inside `transform()`.

## References

**PRs** (all open drafts, re-checked 2026-08-01)

- [grafana/grafana#129542](https://github.com/grafana/grafana/pull/129542) — schema +
  capability; `panelAdHocTransformations` toggle at `pkg/services/featuremgmt/registry.go`
  with `Stage: FeatureStageExperimental`, `Expression: "false"`; 54 files
- [grafana/grafana#129544](https://github.com/grafana/grafana/pull/129544) — frontend
  plumbing; `adHocTransformations.ts`, `runPanelTransformations.ts`, `transformPanelData.ts`;
  24 files
- [grafana/grafana#129545](https://github.com/grafana/grafana/pull/129545) —
  `useAdHocTransformations` / `useTransformedData`; 6 files
- [grafana/grafana#129546](https://github.com/grafana/grafana/pull/129546) — table adoption,
  `HeaderCell` "Hide column"; 4 files
- [grafana/grafana#129563](https://github.com/grafana/grafana/pull/129563) — logs-table
  adoption; `AdHocTransformationPositions`, `splitTrailing`; 19 files
- [grafana/scenes#1589](https://github.com/grafana/scenes/pull/1589) —
  `skipTransformations`; extends the `:227` guard and adds a `subscribeToState` reprocess

**`@grafana/scenes` v8.13.6** (`v13.1.0`'s `package.json` declares `"@grafana/scenes": "^8.2.6"`)

- `packages/scenes/src/querying/SceneDataTransformer.ts` — `activationHandler` `:58-72`,
  `getSourceData` `:74-87`, `reprocessTransformations` `:104-106`, `clone` `:151-159`,
  `haveAlreadyTransformedData` `:169-206`, `transform` `:208`, the guard `:227`, the memo
  check `:238`, interpolation `:265`, topic split `:267,:276`, `ctx` `:290-294`,
  `transformDataFrame` `:296`, `catchError` `:319-345`,
  `_interpolateVariablesInTransformationConfigs` `:363-384`,
  `_filterAndPrepareTransformationsByTopic` `:386-393`
- `packages/scenes/src/core/SceneObjectBase.tsx:240-268` — activation order: own handlers
  `:245`, then `$data` `:260-262`
- `packages/scenes/src/components/VizPanel/VizPanel.tsx` — `_onActivate` `:184-188`,
  `_loadPlugin` `:195`, `_pluginLoaded` `:269-344` (transformations rewrite `:310-320`,
  `this._plugin = plugin` `:329`, `setState` `:331-337`), `getPlugin` `:350-352`,
  `applyFieldConfig` `:511-556` (memo `:525-538`, `applyFieldOverrides` `:547-556`)
- `packages/scenes/src/utils/findPanelProfiler.ts:1-22` — the import-cycle precedent

**grafana/grafana v13.1.0**

- `public/app/features/dashboard-scene/panel-edit/PanelOptionsPane.tsx:175,259`
- `public/app/features/dashboard-scene/panel-edit/PanelOptions.tsx:25,61-73`
- `public/app/features/dashboard-scene/panel-edit/PanelEditor.tsx:234`
- `public/app/features/dashboard-scene/panel-edit/PanelEditNext/PanelEditorRendererNext.tsx:54`
- `public/app/features/dashboard-scene/panel-edit/PanelDataPane/PanelDataTransformationsTab.tsx:74-78,83-84,176,281`
- `public/app/features/dashboard/components/TransformationsEditor/TransformationOperationRow.tsx:119-135`
- `public/app/features/dashboard-scene/inspect/InspectDataTab.tsx:75-81,83-89`
- `public/app/features/dashboard-scene/saving/DashboardSceneChangeTracker.ts:48,62-66,74-77`
- `public/app/features/dashboard-scene/serialization/transformSceneToSaveModel.ts:298-362`
  (transformations `:338-340`, snapshot `:342-359`, pre-transform frames `:346-349`)
- `public/app/features/query/state/PanelQueryRunner.ts:96,134,186,222-228,237`
- `public/app/features/dashboard/state/PanelModel.ts:203,591-610,612-614`
- `public/app/features/panel/components/PanelRenderer.tsx:39,41,42,51,99`
- `public/app/plugins/datasource/dashboard/datasource.ts:87-91,119-152`
- `packages/grafana-data/src/panel/PanelPlugin.ts:159-195,246-251,364-367`
- `packages/grafana-data/src/types/data.ts:211-217` — `DataConfigSource`
- `PanelRenderer` hosts: `public/app/features/explore/Table/TableContainer.tsx`,
  `explore/Graph/ExploreGraph.tsx`, `explore/CustomContainer.tsx`,
  `alerting/unified/components/rule-editor/PreviewRuleResult.tsx`,
  `panel/components/VizTypePicker/VisualizationSuggestionCard.tsx`

**This repo**

- The question this answers:
  [graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md)
- The release gate: [graph-wide-migration.md](./graph-wide-migration.md#the-release-prerequisite)
- The contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- The legacy form: [../data-plane/node-graph.md](../data-plane/node-graph.md)
- Proof dashboard: `provisioning/dashboards/relations/graph-wide.json`
- Where a wide frame currently throws: `src/lib/echarts/converters/nodeGraph.ts:355`

**Branch design doc**

- `.air/plans/ad-hoc-panel-transformations.plan.md` on
  `gtk-grafana/dataviz/ad-hoc-transforms-poc__0-backend-schema`, also vendored into
  #129563's diff alongside `ad-hoc-transform-capability-ideation.plan.md` and
  `in-panel-transformations-capabilities.plan.md`
