# Editor mode (Default / Advanced / API)

## Goal

Every panel family exposes a single flat list of editor options. As
ECharts-specific features layer on top of core-Grafana-parity options, that list
clutters the editor for users who only need critical, parity-level controls. The
shared `editorMode` option tiers the surface so the default experience stays
close to a core Grafana panel while power users can opt into the full set.

The primary consumer is the `showIf` clause of editor builder options. It is
built generically on the shared `PanelOptions` and is wired into two families:
**pie** (part-to-whole) first, then **cartesian**, which gates its Performance
options behind Advanced (see [performance.md](./performance.md)).

Because `showIf` only hides a control — it does not clear the stored value — a
render path that read the options directly would keep applying advanced settings
even after the user switched back to Default. The pie therefore normalizes its
options by mode before rendering: in Default mode
`applyPartToWholeEditorModeDefaults` (`lib/echarts/options/pie.ts`, called from
`buildPanelChartOption`) spreads `ADVANCED_PIE_DEFAULTS` over the stored options,
forcing every advanced option back to its default (including the shared
`animation.enabled`). Advanced and API modes render the stored options as-is.
New families that gate options behind Advanced should apply the same
normalization.

The families that normalize by mode, each dispatched from
`applyEditorModeDefaults` (`lib/echarts/options/editorMode.ts`):
**part-to-whole** (`ADVANCED_PIE_DEFAULTS`), **cartesian**
(`ADVANCED_CARTESIAN_DEFAULTS`), **radar** and **parallel** (their own defaults,
parallel checked first because it shares the multivariate family), **stream**
(`ADVANCED_STREAM_DEFAULTS`), and **relations** — whose three render variants
each own a tier, all applied whatever the selected variant, plus a fourth set for
the shared `animation.enabled` it also gates
(`lib/echarts/relations/options/advancedDefaults.ts`). Heatmap and hierarchy have
no Advanced tier, so the dispatch is the identity for them.

### Tier is not the same as section

The mode decides **whether** a control is shown. It does not have to decide
**where**. `addAdvanced*` (`lib/grafana/editor/common/advanced-options.ts`)
defaults an Advanced option's category to a single shared `"Advanced"` section,
which is what most families want: one clearly-labelled extra group. The helpers
also prefix each description with `Advanced.`, so the tier stays visible when a
control uses a purpose-based section.

**Relations deliberately does not.** It groups by purpose — Relations, Value,
Labels, Layout, Interaction, Edges, Sankey, Chord — and passes its own `category`
to the same helpers, so an Advanced control sits beside the Default-tier controls
it relates to (label width under Labels, force repulsion under Layout) and a
section that happens to be entirely Advanced, like Chord, simply does not render
in Default mode. The `showIf` gate controls visibility, and the description prefix
identifies the tier. Consider this shape for any family whose Advanced bucket
grows past a handful of unrelated controls.

> **Known gap:** cartesian's `performance.*` options are not in
> `ADVANCED_CARTESIAN_DEFAULTS`, so a stored `performance.showPoints: 'never'`
> keeps applying after the user switches back to Default (the rest of cartesian's
> Advanced surface, `animation.enabled` included, does reset). The values are all
> performance-oriented and their defaults are the fast path, so nothing renders
> _worse_ — but the behavior is inconsistent with the rule above and should be
> closed when cartesian gains its next Advanced option.

## Default

Critical, core-parity-only options — the controls a user coming from the
equivalent core Grafana viz expects. Per-module parity is tracked in each
module's `parity.md` (see
[part-to-whole/parity.md](../src/modules/part-to-whole/parity.md)).

Default/parity options carry **no `showIf`**; they are always visible.

## Advanced

Default plus high-value ECharts-only features and less-common core options. The
semantics are **additive**: Advanced never hides a Default option, it only
reveals more. These options are unsupported for core-parity purposes and are
gated with `showIf: isAdvancedEditorMode`.

Treat "Advanced" as a warning, not just a promise of more — this is what the
option's own description says: _"Advanced adds experimental features, which may
not work as expected."_

Register each Advanced control with an `addAdvanced*` helper. Give the helper only
the option-specific description. The helper adds the `Advanced.` prefix, the mode
gate, and the default category.

One thing the additive rule does **not** cover: an Advanced-only _choice_ within
a Default-tier control. `showIf` can hide an option but not one of its values, so
this needs a custom editor that filters its own list — see `RelationsLayoutEditor`,
where the graph layout control is Default-tier but its `Fixed` choice is offered
only in Advanced mode (or when it is already the stored value, so the control
never shows an unresolvable one).

## API

A hidden, JSON-only tier reserved for future full ECharts-API access. `'api'` is
kept out of the radio's `settings.options`, so it can only be set via the
dashboard JSON model; the editor's `RadioButtonGroup` simply shows no active
button for it, which is harmless. This tier is currently **stubbed** —
`isApiEditorMode` exists but nothing consumes it yet.

> **Security note:** before shipping the API tier, injectable ECharts options —
> e.g. a raw tooltip `formatter` that returns HTML (an XSS vector) — **MUST be
> excluded from the API allow-list**. Do not expose arbitrary ECharts option
> pass-through without an explicit, audited allow-list.

## How to use it

Register an Advanced-only option through the matching shared helper:

```ts
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';

addAdvancedRadio(builder, {
  path: 'someAdvancedOption',
  name: 'Some advanced option',
  description: 'Select how the advanced option works',
  defaultValue: 'one',
  settings: {
    options: [{ label: 'One', value: 'one' }],
  },
});
```

Default/parity options should carry no `showIf`. The mode is resolved with
`resolveEditorMode(options)` (unset → `default`).
