import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';

import { resolveRelationsTimeSlider } from 'lib/echarts/relations/options/timeSlider';
import { RelationsStatsPicker } from 'lib/grafana/editor/relations/RelationsStatsPicker';
import { type PanelOptions } from 'types';

import { RELATIONS_CALC_DEFAULT } from 'editor/relations/constants';
/**
 * The mark reducers, applying to **nodes and edges alike** — a mark is a mark — which is
 * what the description promises and what `readNodes` / `readLinks` deliver.
 *
 * `calcs[0]` is the **main stat** and is the only one with a job outside the tooltip: it
 * colours every mark (`colorOf` reads `field.display(value).color`) and, on a sankey or
 * chord, sets ribbon and arc thickness, which ECharts derives from the item value. A chart
 * has one geometry, so that slot is singular by construction.
 *
 * **It does not size a graph node or widen a graph edge**, which this comment claimed for a
 * long time and which the option's own description repeated. `toNodeItems` emits
 * `symbolSize: node.radius ?? relationsNodeSize` and `toLinkItems` emits
 * `lineStyle.width: link.width` — `custom.nodeRadius` and `custom.lineWidth`, per-mark field
 * config, never the reduced value. So on a graph, changing the reducer moves nothing
 * geometric; it changes colours, labels and tooltip rows. Sizing a node by its value is a
 * real gap rather than a wrong comment — see `todo/relations-node-size-by-value.md`. Every calculation after it is a
 * tooltip row and nothing else, so **as many as the user wants** — the picker had a maximum
 * of two and the reader silently dropped `calcs[2..]`, which is the pair of things this
 * replaces. See `normalizeRelationsCalcs` and `secondaryStatsOf`.
 *
 * Deliberately **not** `addStandardDataReduceOptions`, even though this family now has
 * a `reduceOptions` to fill. That helper also registers "Show: Calculate / All values"
 * and "Limit", and neither can mean anything here: a mark *is* a field by contract, so
 * "one mark per row" is not expressible and there are no rows to limit. Registering
 * them would put two controls in the pane that read as working and never do — the same
 * reason `custom.hideFrom` is registered with no editor (`common/fieldConfig.ts`).
 *
 * `reduceOptions.fields` is left out for the same reason: which fields are marks is
 * decided by frame role, not by a matcher.
 *
 * **Hidden while the time slider is on** (`addRelationsTimelineOptions`), which is the
 * other answer to the same question: at one selected row there is nothing left to
 * reduce, every reducer agrees, and leaving the picker up would read as a control that
 * does nothing. The stored `calcs` survive the toggle, so switching back restores them.
 * The slider is registered *before* this picker for that reason — it is the prior
 * question ("reduce the range, or read one instant?"), and the picker is what it reveals.
 *
 * The section is "Value", not core's "Value options": the family now has a "Labels"
 * section beside it, and the two read as a pair. Nothing else in Grafana keys off the
 * borrowed `stat.*` category string.
 */
export function addRelationsStatOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addCustomEditor({
    id: 'reduceOptions.calcs',
    path: 'reduceOptions.calcs',
    name: t('relations.stats.name-calculation', 'Calculation'),
    description: t(
      'relations.stats.description-calculation',
      'How each node and edge reduces its values. The first colours the mark and sizes sankey and chord ribbons; the rest are extra tooltip rows'
    ),
    category: [t('relations.category-value', 'Value')],
    editor: RelationsStatsPicker,
    defaultValue: [RELATIONS_CALC_DEFAULT],
    settings: { allowMultiple: true },
    showIf: (options) => !resolveRelationsTimeSlider(options),
  });
}
