# Editor mode (Default / Advanced / API)

## Goal

Every panel family exposes a single flat list of editor options. As
ECharts-specific features layer on top of core-Grafana-parity options, that list
clutters the editor for users who only need critical, parity-level controls. The
shared `editorMode` option tiers the surface so the default experience stays
close to a core Grafana panel while power users can opt into the full set.

The only consumer is the `showIf` clause of editor builder options; the mode
changes nothing about rendering. It is built generically on the shared
`PanelOptions` and is wired into **pie** (part-to-whole) first.

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

Gate an advanced-only option by passing the shared predicate as its `showIf`:

```ts
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';

builder.addRadio({
  path: 'someAdvancedOption',
  name: 'Some advanced option',
  // ...
  showIf: isAdvancedEditorMode,
});
```

Default/parity options should carry no `showIf`. The mode is resolved with
`resolveEditorMode(options)` (unset → `default`).
