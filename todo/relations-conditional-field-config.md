# Conditional standard options for relations (needs Grafana 13.3)

## Status

This work is blocked until Grafana 13.3 publishes the required API. Pull request 132398 merged. Pull requests 132414 and 132419 remain open.

## Release impact

This work is a Grafana 13.3 follow-up. It does not block the Relations plugin release.

## The capability

[grafana/grafana#132398](https://github.com/grafana/grafana/pull/132398) — "PanelEdit:
conditional field config display", merged, **milestone 13.3.x** — makes four additive
changes to the panel-edit API:

1. `fieldConfig` on `StandardEditorContext`
2. `showIf` on `StandardOptionConfig`
3. a `context` argument passed to both panel-option and field-config `showIf` callbacks
4. a `TContextOptions` type parameter typing that context

Its own description lists this class of use case explicitly ("Stat: Min / Max / Field
min/max when `graphMode` is none").

## Why it is not done yet

`npm view @grafana/data` on 2026-09-15 reports that `latest` is **13.2.2**. There is no 13.3 release to use. The repository pins 13.1.1.

Note also that `package.json` pins `@grafana/*` at 13.1.1 while
`src/modules/relations/plugin.json` already declares `grafanaDependency: ">=13.2.0"`.
Those two disagree today, independently of this document.

## What to do once 13.3 ships

1. Bump `@grafana/{data,ui,runtime,schema,i18n}` to 13.3.x; raise the relations
   `grafanaDependency` to `>=13.3.0`.
2. Gate **Thresholds** on the colour scheme actually being thresholds, in
   `src/lib/grafana/editor/relations/standardOptions.ts`:

   ```ts
   [FieldConfigProperty.Thresholds]: {
     showIf: (_options, context) => context.fieldConfig?.defaults.color?.mode === FieldColorModeId.Thresholds,
   }
   ```

   Thresholds are reachable in this family _only_ as a by-value colour scheme — there is
   no `markLine` equivalent because there are no axes — so under any other mode the steps
   editor configures nothing.

3. Gate **Min / Max / Field min-max** on the colour mode being by-value, by the same
   shape of predicate. These are deliberately kept rather than removed: Grafana's
   `applyFieldOverrides` turns them into `field.state.range`, which is the domain
   `field.display(value)` scales against in `colorOf`
   (`src/lib/echarts/relations/converters/markRead.ts`) — the family's only colour path,
   and the one way to pin a percentage-threshold domain.

   **Verify against `provisioning/dashboards/relations/colour-domain.json`**, which was
   written for exactly this: the gate is right when every panel in that dashboard still
   shows its domain controls and a `palette-classic` panel shows none.

4. Track the override half, which remains open as of 2026-09-15:
   [#132414](https://github.com/grafana/grafana/pull/132414) (panel options on the
   override editor context) and
   [#132419](https://github.com/grafana/grafana/pull/132419) (`showIfOverride`, which
   keeps a property out of the "Add override property" picker). With those, the family
   could stop offering `custom.fixedX`/`fixedY` as overrides when the layout is not
   Fixed, and the chord ring options when the variant is not chord.

## What is already done

The unconditional half shipped in the reorg: `FieldConfigProperty.Actions` and
`FieldConfigProperty.NoValue` are unregistered (`RELATIONS_DISABLED_FIELD_OPTIONS`), and
`DisplayName` is `hideFromDefaults: true` so it stays available as an override only.
