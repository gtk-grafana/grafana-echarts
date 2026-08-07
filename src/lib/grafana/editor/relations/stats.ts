import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';
import { RELATIONS_CALC_DEFAULT } from 'lib/echarts/converters/graphWide';
import { RELATIONS_MAX_CALCS, StatsPickerPair } from 'lib/grafana/editor/relations/StatsPickerPair';
import { type PanelOptions } from 'types';

/**
 * The mark reducers: `calcs[0]` is a mark's main stat, `calcs[1]` its secondary. Both
 * apply to **nodes and edges alike** — a mark is a mark — which is what the description
 * promises and what `readNodes` / `readLinks` deliver.
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
 * The picker is `StatsPickerPair` rather than the stock `stats-picker` for one reason:
 * the stock one has no maximum, so it accepted any number of reducers while a mark has
 * exactly two stat slots and `normalizeRelationsCalcs` quietly dropped the rest. The
 * description said two; now the control does too.
 */
export function addRelationsStatOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addCustomEditor({
    id: 'reduceOptions.calcs',
    path: 'reduceOptions.calcs',
    name: t('relations.stats.name-calculation', 'Calculation'),
    description: t(
      'relations.stats.description-calculation',
      'How each node and edge reduces its values. The first is the main stat, the second the secondary stat'
    ),
    category: [t('stat.add-standard-data-reduce-options.category-value-options', 'Value options')],
    editor: StatsPickerPair,
    defaultValue: [RELATIONS_CALC_DEFAULT],
    settings: { allowMultiple: true, maxCount: RELATIONS_MAX_CALCS },
  });
}
