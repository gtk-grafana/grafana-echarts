# Color schemes and per-item color for hierarchy

> **Status: open.** This was originally a shared bug report for **relations** and
> **hierarchy** — both used the same two-branch colour-mode guard. Relations' half closed
> by deletion: the family pivoted to a field-per-mark contract
> ([graph-wide-migration.md](./graph-wide-migration.md)), so a relations mark's colour is
> now `field.display(value).color` — whatever `applyFieldOverrides` already resolved —
> with no custom dispatch needed at all.
>
> **Hierarchy has not pivoted and still carries the byte-identical guard**
> (`options/hierarchy.ts:64-67`, in `makeHierarchyColorResolver`), so the dispatch bug
> below is live there. Read "node" for what the original report called "node or edge" —
> hierarchy (treemap/sunburst) has tiles, not edges, so the per-edge half of the original
> problem does not apply here at all.
>
> **Why relations' actual fix does not transfer.** Relations could defer entirely to
> `field.display(value).color` because the wide pivot makes every mark its own field, so
> `field.state.seriesIndex` — which `palette-classic` colours by — is already unique per
> mark. Hierarchy's `valueField` is one field shared across every node **row**; calling
> `field.display(value).color` unconditionally would colour every node by that one
> field's single ordinal, i.e. one colour for the whole tree. That is exactly the bug the
> two-branch guard exists to prevent — it needs the other branches filled in, not removed.
> So the fix here is still a mode-dispatch helper (option A1 below), not relations'
> delete-the-resolver move.

## Problem: the two-branch dispatch only handles two of eight colour modes

[`makeHierarchyColorResolver`](../src/lib/echarts/options/hierarchy.ts),
`src/lib/echarts/options/hierarchy.ts:64-67`:

```ts
const byValue =
  valueField != null &&
  valueField.config.color?.mode != null &&
  getFieldColorModeForField(valueField).isByValue === true;
const display =
  byValue && valueField ? (valueField.display ?? getDisplayProcessor({ field: valueField, theme })) : undefined;
```

`isByValue` is a property on the registry entry, not a computed thing. Last measured
against the installed `fieldColorModeRegistry`
(`node_modules/@grafana/data/dist/esm/field/fieldColor.mjs`) on Grafana 13.1.0 /
`@grafana/data` 13.1.1 — re-verify against the currently installed version before
fixing, since this has not been re-checked since:

| `config.color.mode`                       | `isByValue` | guard                        |
| ----------------------------------------- | ----------- | ---------------------------- |
| `fixed` — "Single color"                  | `undefined` | **fails**                    |
| `shades` — "Shades of a color"            | `undefined` | **fails**                    |
| `gradient` — "Gradient"                   | `undefined` | **fails**                    |
| `palette-classic` — "Classic palette"     | `false`     | fails (correct — see banner) |
| `palette-classic-by-name`                 | `false`     | **fails**                    |
| `palette-colorblind` — "Color blind safe" | `false`     | **fails**                    |
| `continuous-*` (all ramps)                | `true`      | passes                       |
| `thresholds` — "From thresholds"          | `true`      | passes                       |

Every "fails" row falls through to `getPaletteColorByIndex(index, theme)`
(`hierarchy.ts:77,79`): Single color, Shades, Gradient, Color blind safe and Classic
palette (by name) are silently dropped — picking any of them changes nothing, and the
chart renders as if Classic palette (by index) were selected regardless.

## A `byName` fixed colour is not run through the theme

`getSeriesColorOverride` returns `color.fixedColor` verbatim
([fields/seriesConfig.ts:191-202](../src/lib/grafana/fields/seriesConfig.ts)), and
`hierarchy.ts:72-74` passes that straight through as the resolved colour. Grafana's
colour picker writes **named** palette tokens — `dark-red`, `semi-dark-blue`,
`super-light-yellow` — which are not CSS colours; the correct form is
`theme.visualization.getColorByName(fixedColor)`, as `pie.ts` already does. Confirmed
still unfixed by reading `getSeriesColorOverride`'s current body: it contains no theme
resolution.

## Flagged, not dispositioned: the numeric node `color` field

[data-plane/graph-long.md](../data-plane/graph-long.md) specs a **numeric** form of a
node-graph `color` column ("interpreted per `field.config.color.mode`"), separate from
the string/CSS form. Nobody has implemented the numeric form for any reader, in either
data-plane kind. This doesn't have a clean disposition in either "closed for relations"
or "open for hierarchy," because it isn't really about either family — it's a gap in the
row-form node-graph spec itself, and hierarchy has no `color`-column concept at all.
Needs a fresh look — possibly "the spec should drop the numeric form" — rather than
being folded into this doc's fix.

## Options

### Fixing the dispatch

**A1 — Complete the dispatch in one shared helper.** Replace the boolean `byValue` with
a switch on the resolved `FieldColorMode`, mirroring `FieldColorSchemeMode.getCalculator`
(`fieldColor.mjs`) but substituting the _item_ index/name for
`field.state.seriesIndex`/`displayName`:

- `mode.isByValue` → `display(value).color` (unchanged);
- `mode.id === 'fixed' | 'shades' | 'gradient'` → one colour for every item, from
  `getFieldSeriesColor(field, theme).color` (already exported and already used by
  [`getSeriesColor`](../src/lib/echarts/style.ts));
- otherwise (`palette-*`) → `mode.getColors(theme)` for the right palette, indexed by
  item position, or `getColorByStringHash(colors, name)` when `mode.useSeriesName`.

Small, local, and uses only documented `@grafana/data` exports.

**A4 — Theme-resolve the override.** One-line: wrap `getSeriesColorOverride`'s result in
`theme.visualization.getColorByName(...)`, as `pie.ts` does. Fix in `seriesConfig.ts` so
every remaining caller (hierarchy, pie) gets it at once, and change tests off `'purple'`
(a valid CSS keyword that happens not to expose the bug) onto a named Grafana token like
`'dark-red'` so the regression is actually pinned.

### Targeting one node

Verified constraint, unchanged since it was first checked: **Grafana has no row-level
matcher.** `FieldMatcherID` has no row-selecting member, and the `byName` editor's
`Combobox` rejects any value not already present as a field or display name — an
override written programmatically with a node name renders as
**"gateway (not found)."**

Hierarchy already has a working escape hatch, though: `buildLegendItems`
(`charts/hierarchy.ts`) surfaces nodes as DOM legend entries, and the legend's colour
picker persists a plain `byName` override that `getSeriesColorOverride` reads back — the
same mechanism relations used before its pivot. So node targeting already works today,
modulo the A4 theme-resolution bug above; no new targeting mechanism is needed.

**Rejected, and still rejected:**

- **A custom matcher + matcher editor** (registering with `fieldMatchers`/
  `fieldMatchersUI`). `fieldMatchersUI` is a global singleton with no per-panel filter, so
  a custom matcher would appear in the override UI of every panel in the Grafana
  instance, including core ones.
- **A panel option holding a per-item map.** Works, but is not a field override, so it
  won't sit with the rest of Grafana's override UI, and it puts data-shaped state into
  `PanelOptions`.

**Still open, minor:** honouring `byRegexp` in `getSeriesColorOverride` (currently
`byName` only) would give a bulk-edit escape hatch ("all `db-*` nodes red"), with one
caveat — the same rule is applied by Grafana's engine to any real field whose name
matches, so a careless regex could rewrite the value field's own colour config
underneath. Not scoped for a first pass.

## Concrete next steps

1. Add failing coverage first: extend `src/lib/echarts/options/hierarchy.test.ts` with
   one case per currently-dropped mode (`fixed`, `shades`, `palette-colorblind`,
   `palette-classic-by-name`, `continuous-GrYlRd`, `thresholds`), and change any override
   test off `'purple'` onto a named token such as `'dark-red'` so A4 has a real assertion.
2. Rewire `makeHierarchyColorResolver` (`options/hierarchy.ts:55`) onto the completed
   dispatch, keeping its signature so both call sites (treemap and sunburst series
   builders) need no change. Verify the legend swatch and the drawn tile resolve
   identically.
3. Theme-resolve at the source: change `getSeriesColorOverride`
   (`fields/seriesConfig.ts:191`) to take a `GrafanaTheme2` and return
   `theme.visualization.getColorByName(fixedColor)`. Touches pie and hierarchy; update
   their tests together.
4. Docs: cross-reference the numeric-`color` gap (above) from
   [data-plane/graph-long.md](../data-plane/graph-long.md) once it has a real
   disposition, rather than leaving it only in this file.

## References

- Color scheme (standard option):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/#color-scheme
- Field overrides (user-facing):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- Field overrides in a panel plugin:
  https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides.md
- Relations' half of this bug, and why the fix doesn't transfer:
  [graph-wide-migration.md](./graph-wide-migration.md)
- Frame spec for the row-form `color` field: [../data-plane/graph-long.md](../data-plane/graph-long.md)
