import { type FieldColorConfigSettings, FieldConfigProperty } from '@grafana/data';
import {
  STANDARD_COLOR_OPTION,
  STANDARD_COLOR_SETTINGS,
  STANDARD_FIELD_OPTIONS,
} from 'lib/grafana/editor/common/fieldConfig';

/**
 * The same options with **"Color series by" off**, for the relations family.
 *
 * `bySeriesSupport` is what puts that Last / Min / Max radio under the colour scheme,
 * and only ever when a by-value mode is picked — `FieldColorEditor` renders it on
 * `item.settings?.bySeriesSupport && colorMode.isByValue`. What it writes, `color.seriesBy`,
 * is read by exactly one function in Grafana: `getFieldSeriesColor`, which this plugin
 * reaches through `getSeriesColor` (`lib/echarts/style.ts`). That covers the families whose
 * mark is a whole series — cartesian, stream, heatmap, multivariate, and the pie's legend —
 * and **not** relations: a relations mark is one node or one edge, coloured by
 * `field.display(value)` where `value` is that mark reduced by `reduceOptions.calcs[0]`
 * (`colorOf`). The radio changed nothing there, on the mark or in the legend, which reads
 * the same model. Offered and inert is worse than absent.
 *
 * Implementing it instead would duplicate a control the family already has: "Calculation"
 * is the visible answer to "which value speaks for this mark", and the same reducer drives
 * the tooltip, the node label and the edge weight. A second reducer for the colour alone
 * would let a node be coloured by its max while it is labelled with its mean.
 *
 * `byValueSupport` stays **on**: that is what keeps thresholds and the `continuous-*`
 * schemes in the picker at all, and those do colour a relations mark.
 */
export const RELATIONS_FIELD_OPTIONS = {
  ...STANDARD_FIELD_OPTIONS,
  [FieldConfigProperty.Color]: {
    ...STANDARD_COLOR_OPTION,
    // Spread from the typed settings rather than read back off the option, whose
    // `settings` is `any` — the one key that differs has to be the only difference.
    settings: { ...STANDARD_COLOR_SETTINGS, bySeriesSupport: false } satisfies FieldColorConfigSettings,
  },
  /**
   * **Display name: override-only.**
   *
   * It is read — a node's name *is* its field's display name (`readNodes`), which is why
   * it also drives the legend and the tooltip header — but only ever usefully per field.
   * A panel-wide display name would rename every node in the graph to the same string,
   * which is not a configuration anyone wants; the useful form is a `byName` override
   * renaming one node, and four provisioned dashboards use exactly that.
   *
   * `hideFromDefaults` takes it out of the Fields tab while leaving it in the override
   * property picker, so nothing is lost. Note edges ignore it deliberately: an edge's
   * display name carries its labels, `e1 {source="a", target="b"}`.
   */
  [FieldConfigProperty.DisplayName]: { hideFromDefaults: true },
};

/**
 * Standard field-config properties the relations family **unregisters** entirely,
 * because nothing on its contract can act on them. A control that is offered and inert
 * is worse than one that is absent — the same reasoning as `bySeriesSupport: false`
 * above, and as `custom.hideFrom` being registered with no editor.
 *
 * - **Actions.** `config.actions` is read nowhere in this plugin. If it is ever
 *   supported, its home is the pinned tooltip footer beside `config.links`
 *   (`tooltip/model.ts`), which is the only per-mark affordance surface the family has.
 *
 * - **No value.** Plumbed but unreachable. `getNoValueText` is wired into the per-mark
 *   formatter (`lib/echarts/style.ts`), but no null ever reaches it: a null node stat
 *   makes the tooltip omit its row outright (`tooltip/model.ts`, deliberate — an empty
 *   value under a "Value" label reads as a failed measurement) and the node label fall
 *   back to the bare name (`options/labels.ts`), while a null edge weight is coerced to
 *   `1` in `readEdges` because the geometry needs a number. So the text could only ever
 *   have applied to a case that does not occur. The edge coercion reporting a fake `1`
 *   is a separate defect — see `todo/relations-null-edge-weight.md`.
 *
 * Min / Max / Field min-max are deliberately **kept**, even though no relations code
 * reads them directly: Grafana's `applyFieldOverrides` turns them into
 * `field.state.range`, which is the domain `field.display(value)` scales against in
 * `colorOf` — the family's only colour path. They are the one way to pin a
 * percentage-threshold domain. See `provisioning/dashboards/relations/colour-domain.json`.
 */
export const RELATIONS_DISABLED_FIELD_OPTIONS = [FieldConfigProperty.Actions, FieldConfigProperty.NoValue];
