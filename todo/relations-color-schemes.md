# Color schemes and per-item color for the relations family

> **Status: fixed for relations, still open for hierarchy — and this doc is now
> about hierarchy.** It was written as a bug report plus a design note for the
> **relations** family, whose three render variants shared one colour resolver,
> `makeRelationsColorResolver`. That resolver is **deleted** (phase 3 of
> [graph-wide-migration.md](./graph-wide-migration.md)): a relations mark is a field, so
> its colour is `field.display(value).color` — whatever `applyFieldOverrides` resolved —
> and all eight modes work with no resolver at all.
>
> **`hierarchy.ts:64-69` still carries the byte-identical two-branch guard**, and
> hierarchy is not pivoting to a field-per-mark contract, so every symptom below is live
> there. Read "relations" as "hierarchy" in the problem statement; the API analysis, the
> option comparison and fixes **A1** and **A4** all transfer unchanged. The parts that
> dissolved under the field contract are marked in the resolution table below.
>
> API facts below were checked against the **installed `@grafana/data` 13.1.1**
> (`node_modules/@grafana/data/dist/…`), not from memory. Line references into
> `node_modules` are to the built ESM files and are given so the claims are
> re-checkable, not as a suggestion to depend on them.

> ## Resolution — **do not close this doc.** Hierarchy still needs the fix
>
> **Shipped for relations in phase 3, and re-confirmed in phase 6.** A `byName`
> `dark-red` override reaches exactly one node as `#C4162A`
> (`charts/relations.test.ts`, "legend colour"), and the legend's own colour picker
> writes that same ordinary override.
>
> [../data-plane/graph-wide.md](../data-plane/graph-wide.md) removes the _relations_ half
> of this by deletion: when a mark is a field, colour is `field.display(value).color` and
> `makeRelationsColorResolver` goes away entirely, so all eight modes work because
> `applyFieldOverrides` already resolved them. But `hierarchy.ts:64-69` carries the
> **byte-identical** guard and hierarchy is not pivoting, so the bug survives there.
>
> | Item                                               | Disposition                                                                                                                                                                                                                                                                             |
> | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Problem 1 — two-branch dispatch drops six modes    | **Closed for relations by deletion; STILL OPEN for hierarchy**                                                                                                                                                                                                                          |
> | Problem 2 — cannot target one node or one edge     | **Closed.** A `byName` override                                                                                                                                                                                                                                                         |
> | A1 — complete the dispatch in a shared helper      | **Still needed**, for hierarchy                                                                                                                                                                                                                                                         |
> | A2 — make value and scheme come from one field     | **Dissolves.** There is no "which field's scheme applies to which number" when the mark _is_ the field                                                                                                                                                                                  |
> | A3 — bound the by-value domain                     | **Dissolves for wide input.** Measured: a wide nodes frame gives `field.state.range` `{min: 8, max: 12}` where the legacy equivalent (with `noderadius`, `arc__ok`) gives `{min: 0.5, max: 60}`                                                                                         |
> | A4 — theme-resolve the `byName` fixed colour       | **Already true upstream.** `applyFieldOverrides` resolves `dark-red` → `#C4162A` before the panel sees it (measured). The defect is that pie/relations re-resolve from `fieldConfig` instead of reading `field.display`; worth fixing at the source, because pie and hierarchy still do |
> | B1 / B2 — legend as the targeting surface          | **Unnecessary for wide input.** The legend colour picker writes a plain `byName` override the engine applies                                                                                                                                                                            |
> | B3 — register a custom matcher                     | **Still rejected**, and now unnecessary                                                                                                                                                                                                                                                 |
> | B4 — panel option holding a per-item map           | **Do not build**                                                                                                                                                                                                                                                                        |
> | B5 — honour `byRegexp` in `getSeriesColorOverride` | **Dissolves** — and its hazard becomes a documented behaviour instead: `byRegexp` tests the **display name**, so `/^e1$/` fails against a labelled field whose display name is `e1 {source="a", target="b"}`                                                                            |
>
> Step 8 of the concrete next steps — a provisioned `colors.json` — is partly served by
> `provisioning/dashboards/relations/graph-wide.json`, which exercises fixed colour on a
> node and on an edge; a per-scheme sweep for hierarchy is still unwritten.
>
> Rewrite plan: [graph-wide-migration.md](./graph-wide-migration.md).

## Problem

Two reported symptoms, one shared cause and one genuine gap.

1. **Bug.** The standard **Color scheme** option does not behave like it does in core
   Grafana. "Single color" is ignored outright, and the by-value schemes
   (Green-Yellow-Red, the continuous ramps, From thresholds) either do nothing or
   paint every node the same color.
2. **Gap.** There is no way to target an individual **node** or an individual **edge**
   with a field override. Nodes and edges are frame _rows_, and Grafana's override
   engine matches _fields_, so `byName` has nothing to bind to. This is the same wall
   the family already documents for `custom.hideFrom`
   ([parity.md:264](../src/modules/relations/parity.md)) and the same wall the data
   links hit (a hovered item resolves links off one field —
   [tooltip/relations.ts](../src/lib/echarts/tooltip/relations.ts) —
   so every node shares one link set).

## Root cause

### The color mode dispatch only has two branches, and needs four

[`makeRelationsColorResolver`](../src/lib/echarts/options/graph.ts) —
`src/lib/echarts/options/graph.ts:89-117`:

```ts
const byValue =
  valueField != null &&
  valueField.config.color?.mode != null &&
  getFieldColorModeForField(valueField).isByValue === true;   // :97-100
const display =
  byValue && valueField ? (valueField.display ?? getDisplayProcessor(...)) : undefined;  // :101-102
```

`isByValue` is a property on the registry entry, not a computed thing. Measured
against the installed package (`fieldColorModeRegistry`,
`node_modules/@grafana/data/dist/esm/field/fieldColor.mjs:23-206`):

| `config.color.mode`                       | `isByValue` | guard at graph.ts:97 |
| ----------------------------------------- | ----------- | -------------------- |
| `fixed` — **"Single color"**              | `undefined` | **fails**            |
| `shades` — "Shades of a color"            | `undefined` | **fails**            |
| `gradient` — "Gradient"                   | `undefined` | **fails**            |
| `palette-classic` — "Classic palette"     | `false`     | fails (correct)      |
| `palette-classic-by-name`                 | `false`     | **fails**            |
| `palette-colorblind` — "Color blind safe" | `false`     | **fails**            |
| `continuous-*` (all ramps)                | `true`      | passes               |
| `thresholds` — "From thresholds"          | `true`      | passes               |

Every "fails" row falls through to `getPaletteColorByIndex(index, theme)`
(`graph.ts:115`), which always reads `theme.visualization.palette` —
[style.ts:36-40](../src/lib/echarts/style.ts). So:

- **Single color is silently dropped.** So are Shades and Gradient.
- **Color blind safe and Classic palette (by series name) are silently dropped** —
  they render as plain classic-palette-by-index, so picking them changes nothing.

Only the two `isByValue: true` groups reach a display processor. `hierarchy.ts:64-69`
has the byte-identical guard, so treemap/sunburst have the same defect.

### The by-value branch is fed the wrong numbers

Where the guard does pass, the value handed to the display processor frequently has
nothing to do with the field whose scheme is being applied.

`getNodeGraphValueField` picks exactly one field — the **nodes** frame's `mainstat`,
else the **edges** frame's `mainstat`
([converters/nodeGraph.ts:170-179](../src/lib/echarts/converters/nodeGraph.ts)) — while
the number passed in is `node.value`, which comes from one of two unrelated places:

- `readNodes` sets `value: numberAt(mainstatField, row)` (`nodeGraph.ts:281`) — `null`
  when the nodes frame has no numeric `mainstat`. `display` then never runs
  (`graph.ts:112-113` short-circuits on `node.value != null`) and every node falls to
  the palette. The scheme appears inert.
- `deriveNodesFromLinks` sets `value` to the node's **degree** (`nodeGraph.ts:330-337`).
  With an edge-only response, the scheme is the _edges_ `mainstat`'s (say 70–5800 ms)
  but the values are degrees (1–4), so every node lands at `percent ≈ 0` and the whole
  graph paints in the ramp's first color.

This second case is the default experience: **every provisioned relations demo panel
except the two "Named nodes" ones is edge-only**
(`provisioning/dashboards/relations/{chord,sankey}.json`, and the TestData
`random edges` panels in `node-graph-testdata.json`). Switching one of those to
Green-Yellow-Red produces a uniformly green graph, which reads as "by value is broken".

### The by-value domain is contaminated by the sibling frame

Even with a well-formed nodes `mainstat`, the gradient is compressed. `field.state.range`
— which `getScaleCalculator` uses to turn a value into a `percent`
(`.../esm/field/scale.mjs:8-31`) — is set by `applyFieldOverrides` from
`calculateRange` → `findNumericFieldMinMax(data)`
(`.../esm/field/fieldOverrides.mjs:142, 216-234, 20-57`), which is the min/max across
**every numeric field in every frame** unless the user turns on "Field min/max"
(`config.fieldMinMax`). A node-graph frame pair mixes `mainstat` (ms), `secondarystat`,
`noderadius` (px), `arc__*` (0–1) and `fixedx`/`fixedy` (px) into that one domain, plus
the edges frame's `mainstat` and `thickness`. The repo already describes this behaviour
accurately in [`resolveFieldThresholds`](../src/lib/grafana/fields/thresholds.ts) —
relations just never accounts for it.

### A `byName` fixed color is not run through the theme

`getSeriesColorOverride` returns `color.fixedColor` verbatim
([fields/seriesConfig.ts:116-127](../src/lib/grafana/fields/seriesConfig.ts)) and
`graph.ts:105-108` hands it straight to ECharts. Grafana's color picker writes **named**
palette tokens — `dark-red`, `semi-dark-blue`, `super-light-yellow` — which are not CSS
colors. The pie converter gets this right and says why:

```ts
// pie.ts:140-142
color: override
  ? theme.visualization.getColorByName(override)
  : display.display.color || getPaletteColorByIndex(index, theme),
```

The relations unit test (`options/graph.test.ts:156-166`) and canvas test
(`components/relations.canvas.test.tsx:231-244`) both use `'purple'`, which happens to
be a valid CSS keyword, so neither catches it. `hierarchy.ts:72-74` has the same bug.

### Links have no color-scheme path at all

`toLinkItems` (`graph.ts:264-289`), `toSankeyLinkItems` and `toChordLinkItems` read only
the per-edge `color` **field** and the ECharts keyword mode (`source`/`target`/`gradient`,
`graph.ts:193-201`). Nothing consults `field.config.color` for an edge. "Color scheme"
is a node-only option today, undocumented as such.

### A numeric node `color` field is documented but unimplemented

`colorAt` deliberately ignores a numeric `color` value and says the options layer will
shade it by the field's scheme (`nodeGraph.ts:154-162`), matching the frame spec
([data-plane/graph-long.md](../data-plane/graph-long.md)). The options layer only
ever looks at `mainstat`, so a numeric `color` column is dropped on the floor.

### Not a cause

Worth ruling out explicitly, because it is the obvious suspicion:

- `field.config.color.mode` **is** populated. `applyFieldOverrides` runs
  `setFieldConfigDefaults` (`fieldOverrides.mjs:123, 286`) against the panel's stored
  `fieldConfig.defaults`, and every provisioned relations panel carries
  `{"color":{"mode":"palette-classic"}}` from `STANDARD_COLOR_OPTION`
  ([editor/common/fieldConfig.ts:10-19](../src/lib/grafana/editor/common/fieldConfig.ts)).
- `field.display` **does** exist: `applyFieldOverrides` assigns it at
  `fieldOverrides.mjs:147`, and `data.series` reaches the chart context post-override
  ([Panel.tsx:59](../src/lib/components/Panel.tsx)). So the
  `valueField.display ?? getDisplayProcessor(...)` fallback at `graph.ts:101-102` is
  only exercised by unit tests.

So the panel is receiving everything it needs; the resolver throws it away.

## Why the obvious approach falls short

**"Do what pie does — call `getFieldDisplayValues`."** That is the right prior art to
study and the wrong function to call here.

What `getFieldDisplayValues` gives pie (`converters/pie.ts:90-97`) is three behaviours,
in `values: true` mode (`.../esm/field/fieldDisplay.mjs:113-140`):

1. mode-correct color per item, by calling the field's display processor;
2. a **per-item palette index**, by mutating `field.state.seriesIndex` before each call
   (`setIndexForPaletteColor`, `fieldDisplay.mjs:115, 228`) — this is the only reason a
   by-series mode yields distinct colors per row;
3. a **per-row `byName` color override lookup** (`lookupRowColorFromOverride`,
   `fieldDisplay.mjs:119, 234-245`) — core's one and only row-targeting mechanism.

Those three behaviours are what relations needs. The function itself is not, because:

- **It iterates fields, not node rows.** Its default matcher is `FieldMatcherID.numeric`
  (`fieldDisplay.mjs:79-86`), so a nodes frame would emit one entry per row for
  `mainstat` **and** `secondarystat` **and** `noderadius` **and** every `arc__*` **and**
  `fixedx`/`fixedy`. Pinning it to `mainstat` needs `reduceOptions.fields`, i.e.
  `addStandardDataReduceOptions`, which the family deliberately does not register —
  rows _are_ the entities ([parity.md:187](../src/modules/relations/parity.md)).
- **It names rows wrongly for us.** `getSmartDisplayNameForRow` (`fieldDisplay.mjs:198`)
  joins the row's other _string_ fields, so a node would be named
  `"gateway Gateway prod #999"` rather than its `title`/`id`. Node identity is already
  defined by the converter and must stay the join key for links.
- **It truncates.** `DEFAULT_FIELD_DISPLAY_VALUES_LIMIT = 25` (`fieldDisplay.mjs:17, 88`).
  A 60-node service graph would lose 35 nodes' colors.
- **It has nothing to say about edges.** Edges are rows of a different frame with no
  numeric field guaranteed at all.
- **Its palette path is subtly broken anyway.** `field.display` from `applyFieldOverrides`
  is wrapped in `cachingDisplayProcessor` (`fieldOverrides.mjs:147-150, 236-253`), whose
  cache key is the value alone — so two rows with equal values receive the same cached
  color even after `seriesIndex` was bumped. Copying the mutate-`state`-and-call trick
  would import that bug.

**"Just drop the `isByValue` guard and always use the display processor."** Also wrong:
for `palette-classic` the calculator reads `field.state.seriesIndex`
(`fieldColor.mjs:244-266`), which `applyFieldOverrides` set to the field's ordinal — one
value for the whole field — so every node would come out the _same_ color. The guard is
there for a real reason; it just needs the other branches filled in rather than removed.

## Options

### (a) Fixing the color scheme

**A1 — Complete the dispatch in one shared helper.** Replace the boolean `byValue` with
a switch on the resolved `FieldColorMode`, mirroring
`FieldColorSchemeMode.getCalculator` (`fieldColor.mjs:244-266`) but substituting the
_item_ index/name for `field.state.seriesIndex`/`displayName`:

- `mode.isByValue` → `display(value).color` (unchanged);
- `mode.id === 'fixed' | 'shades' | 'gradient'` → one color for every item, from
  `getFieldSeriesColor(field, theme).color` (already exported and already used by
  [`getSeriesColor`](../src/lib/echarts/style.ts));
- otherwise (`palette-*`) → `mode.getColors(theme)` for the right palette, indexed by
  item position, or `getColorByStringHash(colors, name)` when `mode.useSeriesName`.

Small, local, uses only documented exports, and fixes six modes at once. Does not by
itself fix the wrong-value problem.

**A2 — Make the value and the scheme come from the same field.** Options, roughly in
increasing cost:

- when the node values are degrees (`deriveNodesFromLinks`), do **not** apply the edges
  `mainstat`'s scheme to them — either build a synthetic degree `Field` and use its
  scheme/range, or fall back to the palette and say so;
- read the nodes-frame `color` field when it is numeric, per the frame spec, and prefer
  _its_ scheme for nodes (that is what the spec means by "interpreted per
  `field.config.color.mode`");
- give edges their own value field (the edges `mainstat`, already resolved as
  `linkValueField`, [charts/relations.ts:26-30](../src/lib/echarts/charts/relations.ts))
  and their own resolver, so the scheme applies to ribbons too.

**A3 — Bound the domain.** Either compute the range per-field
(`getMinMaxAndDelta(field)`) instead of trusting `field.state.range`, or document that
users must enable "Field min/max". Diverging from `state.range` diverges from every
other Grafana panel, so this should probably be documentation plus a parity note, not
code — but it must be a deliberate decision, because it is the difference between a
readable gradient and a flat one on real node-graph frames.

**A4 — Theme-resolve the override.** One-line: wrap `getSeriesColorOverride`'s result in
`theme.visualization.getColorByName(...)`, as pie does. Do it in `seriesConfig.ts` so
hierarchy is fixed at the same time, and change the tests off `'purple'` onto a named
Grafana token so the regression is actually pinned.

### (b) Targeting one node / one edge

Verified constraint: **Grafana has no row-level matcher.** `FieldMatcherID` is
`numeric | time | first | firstTimeField | byType | byTypes | byName | byNames |
byRegexp | byRegexpOrNames | byFrameRefID | byValue`
(`.../esm/transformations/matchers/ids.d.ts`), and `byValue` is "reduce a **field** to
one value and test it" (`.../esm/transformations/matchers/fieldValueMatcher.mjs`), not a
row selector. The docs say the same: users match "by exact name, by regular expression,
by field type, by the query that returned them, or by field values"
(https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides.md).

And the `byName` editor cannot even be coaxed into holding a node name: it is a
`Combobox` populated from `useFieldDisplayNames(data)` and its `onChange` rejects any
value not present in the frames
(`node_modules/@grafana/ui/dist/esm/components/MatchersUI/FieldNameMatcherEditor.mjs`,
`.../MatchersUI/utils.mjs` → `frameHasName`). An override written programmatically with a
node name renders in the UI as **"gateway (not found)"** (`utils.mjs`,
`notFoundOption`).

**B1 — Legend swatch only (what half-exists today).** `buildLegendItems`
(`charts/relations.ts:78-96`) emits one item per node; the legend color picker persists a
`byName` override via `changeSeriesColorConfig` (`seriesConfig.ts:101-113`) which
`getSeriesColorOverride` reads back. Nodes are therefore already targetable — once A4
lands. **Edges are not**, because they are not legend items. Zero new machinery;
half the requirement.

**B2 — Put edges in the legend too.** Emit `source → target` items alongside nodes and
let the same picker handle both. Reuses every piece already in place (override write,
override read, hidden-name handling) and matches how pie and candlestick already do
per-row color. Costs: a legend gated by a "Legend shows: Nodes / Edges / Both" control,
because a 200-edge graph would otherwise produce a 200-row legend; and `source → target`
is not a stable identity when an edges frame has duplicate pairs (the sankey path merges
them anyway — `converters/dag.ts`), so the edge `id` field should be preferred as the
match key with the arrow form as the label.

**B3 — Register a custom matcher + matcher editor.** `fieldMatchers` (`@grafana/data`)
and `fieldMatchersUI` (`@grafana/ui`) are both exported, both are `Registry` instances
with a public `register()`. A `byRelationsItem` matcher with a
`MatcherUIProps`-conforming editor could list node ids and edge ids read from
`props.data`, giving a real "Add field override → Nodes with id" entry. The override
engine would still not apply anything to a row — the converter reads the rule out of
`fieldConfig.overrides` directly, exactly as `getSeriesColorOverride` already does — the
registration exists purely so the UI can express it and so `applyFieldOverrides` does not
log `Unknown field matcher id`. **Rejected as the primary path:** `fieldMatchersUI` is a
global singleton with no per-panel filter
(`.../MatchersUI/fieldMatchersUI.mjs` — `selectOptions()` takes no plugin scope), so the
matcher would appear in the override UI of _every_ panel in the Grafana instance,
including core ones; and registering from a lazily-loaded panel module is an import
side effect with load-order hazards.

**B4 — A panel option holding a per-item map.** `builder.addCustomEditor` with a
`Record<itemId, { color?, links? }>` and an editor that lists the current nodes/edges.
Entirely inside the plugin's namespace, no global registries, and extensible to the data
link gap. Costs: it is not a field override, so it will not sit with the rest of Grafana's
override UI, will not compose with matchers, and puts data-shaped state into
`PanelOptions`.

**B5 — Honor `byRegexp` in `getSeriesColorOverride`.** `matcherName`
(`seriesConfig.ts:70-72`) only reads `FieldMatcherID.byName`. Accepting `byRegexp` too
would give users a free-text escape hatch that already exists in the UI ("Fields with
name matching regex"), and covers bulk intent — "all `db-*` nodes red". **Hazard:** the
same rule is simultaneously applied by Grafana's engine to any real _field_ whose name
matches, so a careless regex could rewrite the `mainstat` field's own color config and
change the by-value scheme underneath. Only viable as an addition to B2, with the
interaction documented.

## Recommendation

Treat (a) and (b) as one change to one function, because they are tiers of the same
resolver and the tiers only make sense together: an override must beat a scheme, and a
scheme must produce a color for _every_ item so that an override reads as an override
rather than as the only source of color.

1. **A1 + A4 + A2's first two bullets** as the bug fix. Lift the tier stack out of
   `makeRelationsColorResolver` into one shared helper (call it
   `makeItemColorResolver`) in `src/lib/grafana/fields/` so hierarchy can adopt it
   unchanged — its guard at `hierarchy.ts:64-69` is the same code with the same three
   defects.
2. **B2** as the targeting answer, for nodes and edges alike. It is the only option that
   reuses machinery already shipping, introduces no global side effects, and matches how
   the plugin already does per-row color for pie slices. B3's UI is nicer and its
   blast radius is not acceptable; record it as considered-and-rejected in `parity.md`.
3. **A3** as a parity note rather than code, unless the demo dashboards show the
   contaminated domain is unusable — in which case revisit.
4. Leave B5 out of the first pass.

Assessment: **(a) is straightforward** — the dispatch, the theme resolution and the
value/scheme pairing are all local, well-typed, and covered by documented exports; the
only real work is deciding what an edge-only graph's node values _mean_. **(b) is not
hard but is a design commitment**, because whichever surface is chosen becomes the
answer for per-item data links and per-item hiding as well.

## Concrete next steps

Ordered, each independently reviewable. Nothing here is implemented.

1. **Add failing coverage first**, so the six dropped modes are pinned before the
   rewrite: extend `src/lib/echarts/options/graph.test.ts` with one case per mode
   (`fixed`, `shades`, `palette-colorblind`, `palette-classic-by-name`,
   `continuous-GrYlRd`, `thresholds`) and change the override test off `'purple'` onto a
   named token such as `'dark-red'` so A4 has a real assertion.
2. **New shared helper**, `src/lib/grafana/fields/itemColor.ts`:
   ```ts
   export interface ItemColorContext {
     theme: GrafanaTheme2;
     fieldConfig: FieldConfigSource;
     field?: Field;
   }
   export type ItemColorResolver = (name: string, value: number | null, index: number) => string;
   export function makeItemColorResolver(ctx: ItemColorContext): ItemColorResolver;
   ```
   Implemented with `getFieldColorModeForField` / `getFieldColorMode`
   (`@grafana/data`), `mode.getColors(theme)`, `getColorByStringHash`,
   `getFieldSeriesColor` and `getDisplayProcessor` — all public exports, all verified
   present in 13.1.1 (`node_modules/@grafana/data/dist/types/index.d.ts:33-38, 74`).
   No new API surface is needed.
3. **Theme-resolve overrides at the source**: change `getSeriesColorOverride`
   (`seriesConfig.ts:116`) to take a `GrafanaTheme2` and return
   `theme.visualization.getColorByName(fixedColor)`, then drop the duplicate wrapping in
   `pie.ts:140-142`. Touches pie, hierarchy and relations; update their tests together.
4. **Rewire `makeRelationsColorResolver`** (`options/graph.ts:89`) onto the helper,
   keeping its tier order (override → node `color` string → scheme → palette) and
   keeping its signature so `graph.ts:219`, `sankey.ts:151`, `chord.ts:121` and
   `charts/relations.ts:87` need no change. **Verify all four call sites resolve
   identically** — the legend swatch and the drawn node must not diverge.
5. **Add the link resolver**: an equivalent `makeRelationsLinkColorResolver` fed by
   `linkValueField`, consumed by `toLinkItems` (`graph.ts:264`), `toSankeyLinkItems` and
   `toChordLinkItems`. Per-edge `color` field still wins; the ECharts keyword mode
   (`source`/`target`/`gradient`) becomes the fallback when no scheme applies, so the
   current default is preserved.
6. **Fix the value/scheme pairing** in `getNodeGraphValueField`
   (`nodeGraph.ts:170`): return the field whose scheme is actually being applied to the
   numbers being passed, and make the degree case explicit rather than accidental.
7. **Legend items for edges** (`charts/relations.ts:78`) plus a "Legend shows" control in
   `src/lib/grafana/editor/relations/`, keyed on the edge `id` so duplicate
   `source → target` pairs stay distinct.
8. **Provisioning**: add a `provisioning/dashboards/relations/colors.json` with one panel
   per scheme (single color, thresholds, a continuous ramp, colorblind) across all three
   variants, plus one panel carrying a per-node and a per-edge override. Required by the
   project's "provisioned dashboard for all new panel functionality" rule.
9. **Docs**: update the Color scheme row of
   [parity.md:174](../src/modules/relations/parity.md) (it currently claims three tiers
   that do not all work), add the edge-scheme and B3-rejected notes to its gaps list, and
   cross-reference the numeric-`color` behaviour in
   [data-plane/graph-long.md](../data-plane/graph-long.md).

## References

- Color scheme (standard option):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/#color-scheme
- Field overrides (user-facing):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- Field overrides in a panel plugin (what matchers exist, `useFieldConfig`,
  `standardOptions` vs `disableStandardOptions`):
  https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides.md
- Custom option editors (needed only if B4 is ever revisited):
  https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/custom-panel-option-editors.md
- Frame spec for the fields involved: [../data-plane/graph-long.md](../data-plane/graph-long.md)
