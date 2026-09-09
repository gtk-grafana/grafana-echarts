# Collecting every edges frame, not the first

> **Scope.** One change to `converters/graphWide.ts`: `findEdgesFrame` becomes plural, so a
> response whose edges arrive as N single-series frames renders its whole topology. Nothing
> about the `graph-*-wide` contract changes. The reader simply starts honouring a
> row-dimension variant the contract already specifies and calls **Multi**
> (`graph-edges-multi`) —
> [Row dimension variants](../data-plane/graph-wide.md#row-dimension-variants) — and which
> nothing has ever read.
>
> Everything under [What was measured](#what-was-measured) was run in this checkout or read
> out of `node_modules/@grafana/data` 13.1.1 / `@grafana/ui` at the pinned version. Claims
> about live Mimir are carried over from the branch that added `longToWide` and are marked
> as such. Everything else is labelled **inferred**.

## Recommendation

Make the collection plural and keep `RelationLink.id === field.name`. The contract's first
sentence is _"identity is `field.name`"_ (`graphWide.ts:22`,
[graph-wide.md](../data-plane/graph-wide.md#identity-display-names-and-override-targeting)),
and a reader that mints its own ids breaks that invariant to buy an id no override can
match — worse than an honest duplicate. Duplicates are harmless everywhere except one
place: `getRelationsTooltipMarks` keys its link map by `id` (`tooltip/relations.ts:44-57`),
so with N marks called `Value` the last one's unit, decimals and `config.links` are served
to all N. Fix that with a reader-minted **`markKey`** — an internal item key, not an id —
and leave `id`, `getOverrideTargetNames` and the override picker telling the truth. The
panel-registered `longToWide` prefix keeps paying for itself, because it is the only thing
that turns the model id into a real `field.name`, i.e. into an override target; after this
change it is about **identity**, not about whether the graph draws at all.

## The gap, exactly

| Fact                                                                                                                                                                                                                                                  | Where                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `findEdgesFrame` is `frames.find(declared) ?? frames.find(shape)` — singular                                                                                                                                                                          | `converters/graphWide.ts:152-156`           |
| `isEdgesWideFrame` shape-matches **any** frame with a numeric field carrying both endpoint labels                                                                                                                                                     | `converters/graphWide.ts:130-139`           |
| A `Format: Time series` response is N frames of `[Time, Value]`, endpoint labels on `Value` — so **every frame passes**, and the reader reads one                                                                                                     | measured against live Mimir (10 series → 1) |
| `frameToGraphWide` reads links from that one frame only                                                                                                                                                                                               | `converters/graphWide.ts:464`               |
| No error, no notice, no log: `links.length > 0`, so the panel draws a one-edge graph and returns a valid option                                                                                                                                       | `converters/graphWide.ts:465-467`           |
| The workaround in the docs — `joinByField(Time)` — yields 10 edges and 13 nodes but leaves **every field named `Value`**, because `joinDataFrames` renames a `Value` field only when `frame.name` is set and a Prometheus range query leaves it unset | measured; `joinDataFrames.mjs:122-136`      |

The reader is the only place this can be fixed for every input, because the prefix cannot
run everywhere — see [Why the prefix is not enough](#why-the-prefix-is-not-enough).

## Why the prefix is not enough

Three reasons, in decreasing order of force.

1. **The host gate is off by default.** `setDataTransformations` is feature-detected, _and_
   "the host additionally gates execution behind `grafana.panelPluginTransformations`, off
   by default" (`lib/grafana/panelDataTransformations.ts:20-26`). So on a stock Grafana
   13.2 the prefix does not run and the reader is the entire data path.
   `provisioning/dashboards/relations/devcortex-wide.json`'s text panel already states the
   consequence — _"without it every panel here draws a single edge, because the reader
   takes the first frame that looks like edges"_ — which is exactly the sentence this
   change is meant to delete.
2. **A response can carry two edges frames that no transformation can union.** Two legacy
   `node_graph` queries in one panel become two `graph-edges-wide` frames, because
   `legacyToWide` maps per frame (`converters/legacyToWide.ts:373-393`); today the second
   is silently dropped. `joinByField` cannot merge two already-wide frames without
   colliding their names, and `groupingToMatrix` returns its input unchanged on any
   multi-frame response ([graph-wide.md](../data-plane/graph-wide.md#dense-graphs-the-adjacency-matrix-variant)).
3. **The reader is where the shape is unambiguous.** `longToWide` has to _decide_ whether a
   labelled series is long or is a single-edge wide frame with a row dimension — an
   inherent ambiguity it now warns about (`isLongEdgesFrame`, `converters/longToWide.ts:97-109`,
   and the in-flight `warnIfWideLookalike`). The reader never faces that question: it reads
   whatever passes the shape test, from however many frames.

## What was measured

A throwaway probe was applied to `graphWide.ts` and reverted. Both variants were run
against the whole suite with `--ci` so no snapshot baseline could be rewritten.

| Probe                                                               | Result                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Plural collection alone (declared-filter, union endpoints, flatMap) | **1 of 1349 tests changes**; 135 snapshots pass unchanged; `tsc --noEmit` clean                                    |
| The one test                                                        | `converters/longToWide.test.ts` — `frameToRelationsGraph(edges())?.links` goes 1 → 3                               |
| The three collected links                                           | `id: 'Value'` × 3, correct endpoints, correct reduced values (`12`, `22`, `32`), `state.calcs` populated per field |
| `relations.canvas.test.tsx` (26 snapshots, 4-node service graph)    | unchanged — every fixture has exactly one edges frame                                                              |
| Plural collection **plus** id synthesis from endpoints              | same single test changes; nothing else moves                                                                       |

Two things follow. The collection is behaviour-preserving for the entire suite, and the
identity decision is **not** forced by any test — both answers compile and pass everything
but the one case. It has to be argued.

### Grafana behaviours the design rests on

Read out of the installed packages, not remembered.

| Behaviour                                                                                                                                                                                          | Source                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A field named exactly `Value` contributes **nothing** to its display name                                                                                                                          | `@grafana/data/dist/esm/field/fieldState.mjs:84-86`                              |
| So the display name of a `Value` field is its formatted label set — `{source="a", target="b"}` — which **is distinct per edge**                                                                    | `fieldState.mjs:87-98`, `getSingleLabelName` at `:146-164` (two keys ⇒ full set) |
| A frame name is prefixed only when `allFrames.length > 1` **and** two consecutive frames have different `.name`; a Prometheus range query sets none, so nothing is prefixed                        | `fieldState.mjs:67-83`                                                           |
| `getUniqueFieldName`'s `1`/`2` ordinals are **frame-local** and only fire when the computed name equals `field.name` — so N one-field frames get no ordinal, and neither does a joined frame       | `fieldState.mjs:106-145`                                                         |
| `byName` matches `field.name` **or** the display name; `byName: 'Value'` therefore hits every edge, and additionally any field whose `labels.__name__` equals its name                             | `matchers/nameMatcher.mjs:12-27`, `:59-74`                                       |
| `byRegexp` tests the **display name only**                                                                                                                                                         | `nameMatcher.mjs:75-90`                                                          |
| `field.state.range` is **response-global** (`findNumericFieldMinMax(data)` over every frame), memoised once per `applyFieldOverrides`, unless `config.fieldMinMax`                                 | `field/fieldOverrides.mjs:216-235`, `:20-58`                                     |
| `field.state.seriesIndex` is a **response-global** counter; time fields are assigned an index but do not consume one                                                                               | `fieldOverrides.mjs:69`, `:141-146`                                              |
| `reduceField` caches into `field.state.calcs` per reducer id and never invalidates on value change; `state` is only **shallow**-copied by the override pass, so the cache is shared with the input | `transformations/fieldReducer.mjs:140-196`; `fieldOverrides.mjs:93-102`          |
| `lastNotNull` / `mean` / `sum` / `count` all skip nulls by default (`NullValueMode.Ignore`); a **zero-length** field returns `undefined` for `lastNotNull`/`mean` and `0` for `sum`/`count`        | `fieldReducer.mjs:436-459`, `:499-501`, `:533-543`, `:164-170`                   |
| `getFieldDisplayLinks(field, rowIdx)` reads `field.values[rowIdx]` and calls `field.getLinks` — the closure the override pass built, which already captured the field's own frame                  | `@grafana/ui/dist/esm/components/VizTooltip/utils.mjs:134-149`                   |
| `joinDataFrames`' multi-frame output has **only `length` and `fields`** — no `name`, no `meta`, no `refId`                                                                                         | `transformers/joinDataFrames.mjs:176-183`                                        |

Two of these correct guesses a reader of this plan would otherwise make.

- **Ragged series are not a reduce problem.** The reader reduces each mark's own field, and
  every reducer skips nulls, so `sum`/`mean`/`count`/`lastNotNull` return the same number
  whether the series was left raw or null-padded onto a union row grid by `longToWide`. The
  "must key on the timestamp, never the row index" rule is a constraint on _building a
  frame_ — it binds `longToWide.joinedRows`/`valuesOnRows` (`converters/longToWide.ts:206-237`)
  and does not bind the reader, which never joins anything.
- **The by-value colour domain does not change either.** Because `calculateRange` falls
  through to `findNumericFieldMinMax(data)` across every frame, a `continuous-GrYlRd` on ten
  raw frames resolves against the same min/max as on one pivoted frame. `seriesIndex`
  numbering is identical too. So "the pivot gives comparable colours" would be wrong.

## Where the collection belongs

`graphWide.ts`, in the four functions that already own role resolution. The contract's
[Frame role resolution](../data-plane/graph-wide.md#frame-role-resolution) table is
unchanged by this — it never said "one frame per role"; it said `meta.type` first, field
shape second — and the [Frame meta](../data-plane/graph-wide.md#frame-meta) section's
"`meta.type` is authoritative in both directions" survives verbatim, on one condition
spelled out below.

| Function                                    | Today                                           | Change                                                                 |
| ------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `isEdgesWideFrame` (`graphWide.ts:130-139`) | per-frame predicate                             | **none**                                                               |
| `isGraphWideFrames` (`:148-150`)            | `frames.some(isEdgesWideFrame)`                 | **none**                                                               |
| `findEdgesFrame` (`:152-156`)               | `find(declared) ?? find(shape)`                 | → `findEdgesFrames`: `filter(declared)`, **else** `filter(shape)`      |
| `endpointNames` (`:186-196`)                | one frame's endpoints                           | union over every collected edges frame                                 |
| `findNodesFrame` (`:168-183`)               | excludes `edgesFrame` and `meta.type === edges` | excludes every frame `isEdgesWideFrame` claims, collected or not       |
| `resolveGraphWideRoles` (`:204-210`)        | `{ edgesFrame, nodesFrame? }`                   | `{ edgesFrames, nodesFrame? }`                                         |
| `readLinks` (`:305-351`)                    | one frame                                       | unchanged per frame; `frameToGraphWide` flatMaps it over `edgesFrames` |

**Declared-wins must become a filter, not a find.** If a declared `graph-edges-wide` frame
is present, only declared frames are collected; the shape test is consulted only when
nothing declares itself. Three reasons:

1. It is the only reading that keeps `graphWide.test.ts:580` (_"picks the declared edges
   frame over one that merely looks like edges"_) passing — collecting both would give
   `['x-->y', 'e1']`.
2. It keeps `meta.type` authoritative in the negative direction as well: a frame that
   declares itself is never mixed with frames that were merely guessed at.
3. It keeps the reader and the prefix agreeing about one response. `longEdgeSeries`
   (`converters/longToWide.ts:120-126`) declines the whole response when something else is
   already the edges frame; with declared-as-filter the reader makes the same call, so a
   declared frame beside long series renders exactly what it renders today.

`findNodesFrame` widening its exclusion from `meta.type === GRAPH_EDGES_WIDE` to
`isEdgesWideFrame(frame)` is a small hardening, not a behaviour change in any known input:
a shape-matched edges frame that was _not_ collected (declared-wins case) is currently
still a nodes candidate, and would only be picked if one of its numeric fields were named
after an endpoint. **Inferred**, not measured — no fixture reaches it.

## Identity, and the one thing duplicates actually break

N frames × a field named `Value` is N marks with the id `Value`. What each consumer does
with that, traced:

| Consumer                                                                  | With duplicate ids                                                                                                                               | Verdict            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| ECharts topology (`options/graph.ts:414-415`, sankey, chord)              | links resolve by `source`/`target`, never by id — full topology draws                                                                            | fine               |
| `dag.ts` cycle breaking / parallel merge (`:49-77`)                       | keys on `source`/`target`; the comment already says "the first link's id … win"                                                                  | fine               |
| Tooltip value                                                             | comes off the item (`data.value`), per link                                                                                                      | fine               |
| **Tooltip formatter + data links** (`tooltip/relations.ts:44-57`, `:104`) | `Map<string, RelationsMark>` keyed by `id` ⇒ **last write wins**; all N edges format with the last edge's unit and surface its `config.links`    | **broken**         |
| `withoutHiddenMarks` (`charts/relations.ts:76-90`)                        | reads `link.hidden` off the mark's own field, never the id — per-edge hide still works                                                           | fine               |
| `getOverrideTargetNames` (`charts/relations.ts:206-214`)                  | emits `'Value'` N times; `byNames` is a `Set`, and `'Value'` matches every edge field, so the kept list keeps them all                           | fine, by luck      |
| `toggleSeriesVisibilityConfig` (`fields/seriesConfig.ts:231-276`)         | relations uses `SeriesVisibilityChangeBehavior.Hide` (`hooks/useLegend.tsx:88-93`) ⇒ `AppendToSelection`, so the universe is what protects edges | fine               |
| `buildLegendItems`, `getLegendHighlightTargets`, `hiddenNodeIds`          | node names / node ids only; nodes here are derived from endpoints and unique                                                                     | fine               |
| `byName` / `byRegexp` per-edge overrides                                  | `byName: 'Value'` hits **all**; `byName: '{source="a", target="b"}'` hits **exactly one**, because the display name is the label set             | degraded, not lost |

So exactly one consumer is wrong, and it is wrong in the class of bug phase 5 existed to
kill — "the tooltip formats with somebody else's field" (`graph-wide-migration.md`, gaps
1–3). It is invisible until a user writes the one per-edge override the raw path _does_
support (a `byName` against the display name), and then it silently paints on every edge.

### Decision: keep `id`, add `markKey`

**Do not synthesise `RelationLink.id`.** Four arguments, strongest first:

1. **It is the contract's invariant.** `graphWide.ts:19-30` and
   [graph-wide.md](../data-plane/graph-wide.md#edges-frame--graph-edges-wide) both define
   `field.name` as "edge id, **and the stable override target**". A minted id is not an
   override target: `byNames`/`byName` compare against `field.name` or the display name
   (`nameMatcher.mjs:12-49`), and a synthetic `a-->b` is neither. The user would be shown
   an id that looks addressable and is not.
2. **It puts a live footgun in `getOverrideTargetNames`.** That list feeds an _exclude_
   matcher. Emit `a-->b` where the field is `Value` and the kept list stops covering the
   edge fields, so hiding one node erases **every link in the panel** — the measured
   phase-4 catastrophe (`graph-wide-migration.md`, "An exclude-mode matcher over a legend
   that is not the field universe"; canvas strokes 3 vs 0). Synthesising forces a
   compensating change to `charts/relations.ts:213`; not synthesising forces none.
3. **It would have to reproduce `longToWide`'s minting exactly, or diverge from it.**
   The prefix bases an id on `config.displayNameFromDS`, else `frame.name` unless that is
   only the label set, else `source-->target`, then discriminates clashes by the
   non-endpoint label set and finally by `#n` (`converters/longToWide.ts:148-185`). A
   reader that minted differently would give the same response different ids depending on
   whether the host's flag is on — and `byName` overrides written against one would silently
   stop matching under the other.
4. **`getFieldDisplayName` is the wrong source, and the reader already says so.**
   `readNodes` carries the comment _"Deliberately not `getFieldDisplayName`, which appends
   the label set"_ (`graphWide.ts:361-363`). Three measured reasons it is right: the result
   is **not stable** — adding a frame changes it, because `getSingleLabelName` scans every
   frame (`fieldState.mjs:146-164`; graph-wide.md verified behaviour #2b); it is **cached on
   `field.state.displayName` keyed only on `allFrames.length > 1`** (`fieldState.mjs:40-52`),
   so a reader calling it mutates state the override matchers read back; and for a node the
   id _is_ the ECharts graph key that every edge's `source`/`target` label resolves against,
   so a display-name id would detach the topology.

**Add `RelationLink.markKey?: string`** instead — minted by the reader only when `id` is not
unique among the collected links, and used for nothing but the item-to-field lookup:

- `tooltip/relations.ts` keys the link map by `markKey ?? id`;
- `options/graph.ts:355`, `options/sankey.ts:189`, `options/chord.ts:158` emit
  `markId: link.markKey ?? link.id`, so the readable value survives in the normal case.

`markKey` is an internal key, never rendered (an edge's tooltip header is
`source → target`, `tooltip/relations.ts:113`) and never matched against, so its stability
bar is far lower than an id's. Mint it from `edgeId(source, target)`
(`converters/toGraphWide.ts:33-35`), then the non-endpoint label set, then `#n` — the same
ladder as `longToWide.uniqueId`, so lifting that helper into `toGraphWide.ts` and calling it
from both is the drift-proof form.

**A positional key is not an option**, for the reason the migration doc already recorded
about `dataIndex`: `getRelationsTooltipMarks` is built in `buildOption`
(`charts/relations.ts:126`) _before_ `getSankeySeries` merges parallel links and breaks
cycles (`dag.ts:49-77`), so an index into `data.links` does not address the sankey's item
list.

### What stays lost, and is documented rather than fixed

- `byName` on the raw name cannot target one edge of a `Value`-named response, and the
  override picker lists `Value` once per frame. The contract already states this
  ([Identity](../data-plane/graph-wide.md#identity-display-names-and-override-targeting)):
  _"a field named `Value` … makes `byName: 'Value'` match **every** edge at once"_. The fix
  is at the source — a legend format, or the pivot — not in the reader.
- The display-name route (`byName: '{source="a", target="b"}'`, `byRegexp`) does work, and
  breaks the moment a legend format is added, because `displayNameFromDS` then wins
  (`fieldState.mjs:61-63`).
- `palette-classic-by-name` hashes `field.state.displayName ?? field.name`
  (`fieldColor.mjs:255-259`) and the override pass nulls the cache, so N fields named
  `Value` would all hash to one colour. It does not bite today: edges discard palette modes
  (`edgeColorOf`, `graphWide.ts:245-248`) and the nodes here are derived and have no field.

## Nodes

**A node-stat query stays out of scope.** `sum by (server) (…)` is long too, but its value
field is named `Value` and `findNodesFrame` requires a numeric field whose _name_ is a known
endpoint (`graphWide.ts:168-183`), so it never matches. That guard is load-bearing — it is
what stops an unrelated series in a mixed response becoming a phantom node
(`graphWide.test.ts:599-611`) — and relaxing it would need a node-key signal the reader does
not have: one endpoint label is not a pair, and the transformations supplier's context is
`{ series }` only, so no panel option can reach either layer
(`modules/relations/dataTransformations.ts`, closing note). `longToWide` says the same in its
header. A node-stat frame therefore still needs `organize` + `rowsToFields`, which is exactly
what `devcortex-wide.json` panel 6 keeps, filtered `byRefId`, as "the honest picture of the
gap". Nodes an edge names still appear, via `deriveNodesFromLinks` — with no stat of their
own.

**What the reader should do:** the two mechanical consequences of plural edges (union the
endpoint set; exclude every edges candidate from the nodes search), and one optional
extension — make the nodes side plural as well, taking the **first** field per id when two
nodes frames declare the same node. It is five lines and it closes the same silent drop on
the nodes side: `legacyToWide` converts every legacy nodes frame it finds
(`legacyToWide.ts:385-388`), so a two-query legacy response can produce two
`graph-nodes-wide` frames of which the reader reads one. Keep it as a separate step so it
can be dropped without touching the rest.

Not in scope on the nodes side either: two fields with the same name _inside_ one nodes
frame. That is a genuine id collision (a node id is the ECharts graph key), not a display
problem, and it has no input that produces it today.

## `sourceRowIndex` and the per-mark `Field`

Every mark carries its own `Field` (`relationsModel.ts:62-67`, `:97-98`) and
`sourceRowIndex: 0` with the comment _"A wide frame is a single row"_
(`graphWide.ts:323-325`). Cross-frame marks:

| Concern                                            | Effect                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data links resolving against the wrong frame       | **Cannot happen.** `getFieldDisplayLinks(field, rowIdx)` calls `field.getLinks`, the closure `applyFieldOverrides` built with `__dataContext.frame` already bound (`fieldOverrides.mjs:104-115`, `:155-162`). Each mark's field carries its own frame |
| Ad-hoc "filter for" chips                          | Read `field.labels` (`EChartsTooltip.tsx:66-76`), which on a raw frame are the datasource's own `source`/`target` plus everything else — a small win the raw path gets for free                                                                       |
| `reduceValue` over ragged series                   | Correct per mark and identical to the pivoted value (see [What was measured](#grafana-behaviours-the-design-rests-on)). Measured raggedness on live Mimir: 1, 2, 4, 13, 33, 57 rows in one response                                                   |
| A series with **zero** rows                        | `isEdgesWideFrame` still claims it; `lastNotNull` returns `undefined`, `reduceValue` returns `null`, and `value ?? 1` (`graphWide.ts:319-321`) draws a weightless edge. Pre-existing; keep, and note it                                               |
| **`sourceRowIndex: 0` is no longer one timestamp** | The real regression in kind. Row 0 of a 1-row series is "now"; row 0 of a 57-row series is an hour ago. A data link interpolating `${__value.numeric}` therefore disagrees with the tooltip's reduced value, and disagrees _differently per edge_     |
| `field.state.calcs` cache                          | Shared by reference through the override pass's shallow `state` copy (`fieldOverrides.mjs:93-102`). Harmless — the values array is the same one — but it means the reader warms a cache on frames the host owns                                       |

The `sourceRowIndex` mismatch is **pre-existing** for the ranged single-frame variant, which
has had many rows since phase 2. What changes is that it becomes the common case. Do not fix
it here: the only defensible alternative is "the row the reducer picked", which is
well-defined for `first`/`last`/`lastNotNull`/`min`/`max` and meaningless for `mean`/`sum`.
Record it, and note that the pivot _does_ fix it — one shared row grid means row 0 is one
timestamp for every mark.

## Interaction with `longToWide`

### What the prefix still buys

| Buys                                                                                                                        | Why the reader cannot                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A real `field.name` per edge — so an override target, a picker entry, a `byName`/`byRegexp` match and a per-edge `hideFrom` | Only a transformation running before `applyFieldOverrides` can create a field for an override to land on. This is the whole thesis of the pivot |
| Ids from `displayNameFromDS` / `frame.name`, with parallel edges discriminated **in the name**                              | The reader can mint a `markKey` but must not mint an id                                                                                         |
| One shared row grid, so `sourceRowIndex: 0` is one timestamp and data-link values are comparable across marks               | The reader does not build a frame                                                                                                               |
| `meta.type` + `typeVersion` stamped (`toGraphWide.ts:71-87`), so role resolution is declared rather than inferred           | A reader cannot stamp its input                                                                                                                 |
| `frame.length` becomes meaningful for anything that later wants the row dimension                                           | —                                                                                                                                               |

### What it does **not** buy, contrary to a natural guess

Comparable by-value colours, comparable `field.state.range`, or different palette indices —
all three are response-global already (`fieldOverrides.mjs:216-235`, `:69-146`).

### Registration must not change

`relationsDataTransformations` tests `isLongGraphFrames` **first**, ahead of
`isGraphWideFrames`, and that order stays. Its comment's stated reason changes, though:
today it is _"testing already-wide ahead of the pivot would leave the panel reading the
first frame only, i.e. a one-edge graph"_ (`modules/relations/dataTransformations.ts:22-28`).
After this change the reader would render all N either way; the reason to keep the order is
that the pivot is what makes them **addressable**. Flipping it would trade ten override
targets for zero.

### The reader cannot double-count

`longToWide` replaces the claimed frames with one pivoted frame and drops the rest
(`flatMap`, `converters/longToWide.ts` tail), and `longEdgeSeries` claims either all
`isLongEdgesFrame` frames or none. So the reader never sees a series and its pivot together.

**One new behaviour, and it is worth stating.** For `[shape-wide edges frame, long series
×3]`, `longEdgeSeries` declines (something else is already the edges frame) and the reader
now collects **all four** — 2 declared-by-shape edges plus 3 raw ones — where today it
collects only the first frame. That is more data, not less, and the decline rule stays right
for its own reason: a second pivoted frame would be a rival edges frame with rival ids.
**Inferred** — no fixture produces this shape.

`frameToRelationsGraph` (`converters/relationsGraph.ts:23-39`) and
`converters/relationsModel.ts` need no logic change; both need a doc-comment pass, and
`relationsModel.ts` needs the `markKey` field documented next to `id`'s guarantee.

## What must not move

### Tests

| File                                            | Expectation                                              | After                                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `converters/longToWide.test.ts`                 | `frameToRelationsGraph(edges())?.links` has length **1** | **Changes** — the only one in 1349. The working tree already carries a rewrite asserting length 3 with `new Set(['Value'])`, which is this plan's answer |
| `converters/graphWide.test.ts:580`              | declared edges frame wins over a `x-->y` lookalike       | must still pass ⇒ declared-as-filter                                                                                                                     |
| `converters/graphWide.test.ts:599`              | an unrelated `time`+`cpu` frame is not read as nodes     | unchanged — `cpu` has no labels and no separator                                                                                                         |
| `converters/graphWide.test.ts:613`              | an undeclared nodes frame naming the endpoints is found  | unchanged — `a`/`b` are not edges candidates                                                                                                             |
| `charts/relations.test.ts:398-405`              | `getOverrideTargetNames` → `['Gateway', 'API', 'e1']`    | unchanged, with `markKey` or with `link.field?.name ?? link.id`                                                                                          |
| `modules/relations/dataTransformations.test.ts` | every assertion                                          | unchanged; two comments need rewriting (the "one-edge graph" rationale)                                                                                  |
| `converters/legacyToWide.test.ts`               | every assertion                                          | unchanged — each fixture has one frame per role                                                                                                          |
| `converters/relationsGraph.test.ts`             | every assertion                                          | unchanged                                                                                                                                                |
| `components/relations.canvas.test.tsx`          | 26 snapshots                                             | unchanged, measured. **Do not let lefthook rewrite a baseline** — run `--ci`                                                                             |

### Dashboards

Surveyed all nine files in `provisioning/dashboards/relations/`. **No panel relies on
exactly one of several candidate edges frames**, so the render is unchanged everywhere.

| Group                                                                                                                         | Why unaffected                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `chord` 5, 8; `sankey` 6, 10; `node-graph-testdata` 6–8, 10, 11; `node-graph-sql-expressions` 5; `per-mark-tooltip-links` 2–8 | second frame is a **declared** `graph-nodes-wide`, so `isEdgesWideFrame` returns `false`                                           |
| `graph-wide` 14, 15; `observability-sources` 3; `devcortex-sources` 3; `devcortex-wide` 6                                     | **shape-only** role resolution — the regression set worth eyeballing. In each, exactly one frame shape-matches                     |
| `observability-sources` 4, 5, 8, 9, 10; `graph-wide` 18                                                                       | their labels are `node`/`namespace`, `service`/`upstream`, … or absent, so **no raw frame passes** and the join stays load-bearing |
| `devcortex-wide` 3–6, 8–11; `observability-sources` 11                                                                        | canonical `source`/`target` labels ⇒ the pivot claims them today, before the reader sees them                                      |

Prose that becomes wrong, and has to be edited:

| Text                                             | Says                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `observability-sources.json` text panel **1**    | _"the panel sees only the **first** frame — one edge — because `findEdgesFrame` takes the first match"_                              |
| `observability-sources.json` panel **3**         | _"Without the joins the panel would see one edge"_                                                                                   |
| `observability-sources.json` panel **4**         | _"Both refIds are edges and belong in the same frame"_ — no longer required                                                          |
| `graph-wide.json` panel **18**                   | _"the reader takes the first frame that looks like edges"_ — the conclusion ("draws nothing") survives, the mechanism does not       |
| `devcortex-wide.json` text panel **1**           | _"without it every panel here draws a single edge"_ — the sentence this change deletes                                               |
| `devcortex-wide.json` panel **6**                | node-chain rationale, still true; the edges half needs rewording                                                                     |
| `docs/relations-data-sources.md:294-306`         | _"the reader takes the **first** frame that looks like edges … a nine-edge query draws one edge"_                                    |
| `converters/longToWide.ts:41`, `:120`            | the converter's stated reason to exist, and `longEdgeSeries`' rival-frame guard                                                      |
| `modules/relations/dataTransformations.ts:22-28` | the branch-order rationale                                                                                                           |
| `data-plane/graph-wide.md:578-584`               | the **Multi** variant's "works because `getFieldDisplayName` … substitutes the frame name" — measured false for a frame with no name |

## Test plan

New cases in `converters/graphWide.test.ts`, in the existing style (a comment carrying the
reasoning, one assertion per claim):

1. **`collects every frame that looks like edges`** — three `[Time, Value]` frames with
   `source`/`target` labels; assert three links with the right endpoints and reduced values.
   The comment says this is the shape any labelled datasource returns and that the reader is
   the only path when `grafana.panelPluginTransformations` is off.
2. **`collects only the declared frames when any frame declares itself`** — one
   `GRAPH_EDGES_WIDE` frame plus a shape-only `x-->y` lookalike; assert `['e1']`. The
   generalisation of `:580`, and the reason declared-wins is a filter.
3. **`unions the endpoint set across every edges frame when looking for nodes`** — two
   single-edge frames (`a→b`, `b→c`) plus an undeclared frame with fields `b`, `c`; assert
   `c`'s value comes from the nodes frame, not from its degree.
4. **`does not read a second edges frame as the nodes frame`** — two shape-matched edges
   frames; assert every node is derived (`field == null`) and no edge went missing.
5. **`keeps field.name as the id, even when several marks share it`** — the `Value` × 3
   fixture; assert `links.map(l => l.id)` is `['Value','Value','Value']`, with the comment
   naming the contract invariant and pointing at the prefix for the fix.
6. **`gives each colliding mark its own lookup key`** — same fixture; assert `markKey` is
   unique and derived from the endpoints, and that a non-colliding fixture leaves `markKey`
   unset.
7. **`reduces each mark over its own rows, however ragged`** — series of 1 and 4 rows with a
   gap; assert `sum` and `mean` per mark and that a null is skipped rather than zeroed.
8. **`draws a weightless edge for a series with no samples`** — zero-row frame; assert
   `value === 1` and no throw.
9. **(with the optional nodes step) `reads every nodes frame, first field per id winning`**.

In `tooltip/relations.test.ts` (or wherever `getRelationsTooltipMarks` is covered): **two
marks with the same `id` but different `markKey` and different units resolve to their own
formatters** — the regression test for the only thing duplicates break. Drive it through
`applyTestFieldConfig` (`src/test/fieldConfig.ts`) with a `byName` override on one edge's
**display name**, since that is the only matcher that can address one of them.

In `converters/relationsGraph.test.ts`: a raw multi-frame response renders N links and every
mark carries its own field — the entry-point-level statement of the same claim.

No new canvas snapshot. The change is measured not to move any of the 135 existing ones, and
a new multi-frame canvas case would only assert what `graphWide.test.ts` already does.

## Risks and honest limits

**Cannot be fixed in the reader:**

- Per-edge overrides on identically-named fields, via the raw name. `byName: 'Value'` is
  all-or-nothing by Grafana's own matcher (`nameMatcher.mjs:12-27`).
- The override picker on a `Value`-named response. It lists one `Value` entry per frame plus
  each label-set display name; it is honest and it is ugly.
- Node statistics from a labelled query — still `rowsToFields`, or a future
  node-long conversion.
- `sourceRowIndex` vs. the reduced row (above).
- Gap 4 (`relations-data-links.md`): every node in a raw multi-frame response is derived, so
  none carries a data link. Raw multi-frame makes that the _default_ rather than an edge
  case, which strengthens the argument for a nodes frame rather than weakening it.

**New risks, all judged small:**

- A response that silently drew one edge now draws N. Nothing in the repo depends on the
  old behaviour (surveyed), and a dashboard that already added a join is unaffected — a join
  produces one frame.
- A frame that shape-matches by accident is now collected instead of ignored. An unrelated
  second query grouped `by (source, target)` would contribute edges where before it only did
  so if it came first. The blast radius grows from "first frame" to "every frame"; the
  mitigation is the shape test itself, which is the contract.
- Two unrelated graph queries in one panel now union into one topology. Probably wanted;
  visible either way.
- Performance: unchanged per field, and the collection is one extra `filter` pass. The
  contract's ceiling is per-frame field count, which this does not raise
  ([Performance](../data-plane/graph-wide.md#performance-which-frame-shape-is-cheapest)).

**What becomes possible that is not today:**

- A raw Prometheus / Loki / TestData `Format: Time series` response renders its full topology
  with **no transformations and no host feature flag** — the only configuration in which
  `devcortex-wide.json` works at all today is with `grafana.panelPluginTransformations`
  turned on.
- Two edges frames from two queries union into one graph, which no core transformation can
  express.
- A declared `graph-nodes-wide` frame beside N raw labelled edge series.
- A datasource emitting `graph-edges-wide` **per series** — the contract's Multi variant —
  becomes readable, which is the shape a native producer is most likely to emit.

## Steps

Each step is independently reviewable; 1–2 are the change, 3–6 make it correct, 7 is
optional, 8–11 are the paper trail.

| #   | Step                                                                                                                                                                                                                                                                                                                                                                                 | File                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `findEdgesFrame` → `findEdgesFrames` (declared-**filter**, else shape-filter); `endpointNames` unions; `findNodesFrame` excludes every `isEdgesWideFrame` candidate; `resolveGraphWideRoles` returns `edgesFrames`; `frameToGraphWide` flatMaps `readLinks`. Rewrite the file-header and per-function comments to say why plural, and keep the `meta.type`-both-directions paragraph | `src/lib/echarts/converters/graphWide.ts`                                                                                                                                                  |
| 2   | Mint `markKey` on a link whose `id` is not unique among the collected links; lift `uniqueId`/`contestedIds` out of `longToWide.ts` into `toGraphWide.ts` so both callers share one ladder                                                                                                                                                                                            | `src/lib/echarts/converters/graphWide.ts`, `converters/toGraphWide.ts`, `converters/longToWide.ts`                                                                                         |
| 3   | Document `RelationLink.markKey` beside `id`, restating that `id` is always `field.name` and that `markKey` is an item key, never a target                                                                                                                                                                                                                                            | `src/lib/echarts/converters/relationsModel.ts`                                                                                                                                             |
| 4   | Key the link mark map by `markKey ?? id`                                                                                                                                                                                                                                                                                                                                             | `src/lib/echarts/tooltip/relations.ts`                                                                                                                                                     |
| 5   | Emit `markId: link.markKey ?? link.id`                                                                                                                                                                                                                                                                                                                                               | `src/lib/echarts/options/graph.ts`, `options/sankey.ts`, `options/chord.ts`                                                                                                                |
| 6   | Two `debug()` notes, matching the diagnostics the branch is already adding: an **info** when more than one edges frame is collected (with the count that would otherwise have been lost), and a **warn** when ids collide, naming the legend format / pivot as the fix                                                                                                               | `src/lib/echarts/converters/graphWide.ts`                                                                                                                                                  |
| 7   | _Optional, separately reviewable:_ plural nodes frames, first field per id winning                                                                                                                                                                                                                                                                                                   | `src/lib/echarts/converters/graphWide.ts`                                                                                                                                                  |
| 8   | _Optional hardening:_ `getOverrideTargetNames` reads `link.field?.name ?? link.id`, making "the universe is field names" explicit                                                                                                                                                                                                                                                    | `src/lib/echarts/charts/relations.ts`                                                                                                                                                      |
| 9   | Tests per [Test plan](#test-plan)                                                                                                                                                                                                                                                                                                                                                    | `converters/graphWide.test.ts`, `tooltip/relations.test.ts`, `converters/relationsGraph.test.ts`, `converters/longToWide.test.ts`, `modules/relations/dataTransformations.test.ts`         |
| 10  | Docs: the **Multi** variant now has a reader; role resolution is one-to-many; the identity degradation and its fix                                                                                                                                                                                                                                                                   | `data-plane/graph-wide.md`, `todo/graph-wide-migration.md`, `docs/relations-data-sources.md:294-306`, `converters/longToWide.ts:41,:120`, `modules/relations/dataTransformations.ts:22-28` |
| 11  | Panel prose per [What must not move](#dashboards)                                                                                                                                                                                                                                                                                                                                    | `provisioning/dashboards/relations/observability-sources.json` (text panel 1, panels 3, 4), `graph-wide.json` (panel 18), `devcortex-wide.json` (text panel 1, panel 6)                    |

**Verification.** `npx tsc --noEmit` clean; `npx jest --ci` with exactly the one changed test
and 135 snapshots unchanged; then a browser pass — rebuild `dist` first, since the container
serves it — on `graph-wide.json` panels 14/15 (shape-only roles), `observability-sources.json`
panel 3, and `devcortex-wide.json` with `grafana.panelPluginTransformations` **off**, which is
the configuration the change exists for.

## References

- The contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md) —
  [Frame role resolution](../data-plane/graph-wide.md#frame-role-resolution),
  [Row dimension variants](../data-plane/graph-wide.md#row-dimension-variants),
  [Identity](../data-plane/graph-wide.md#identity-display-names-and-override-targeting)
- The migration this extends: [graph-wide-migration.md](./graph-wide-migration.md), phases 4
  and 5 for the override-universe and per-mark-tooltip reasoning
- Why the conversion has to run above the panel:
  [graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md)
- The repo's precedent for one-to-many frame reading, including its resolutions for row
  order and missing cells: [multiple-frames.md](./multiple-frames.md)
- Sourcing recipes that this change simplifies: [../docs/relations-data-sources.md](../docs/relations-data-sources.md)
- Still open, unchanged by this: [relations-data-links.md](./relations-data-links.md) gap 4
