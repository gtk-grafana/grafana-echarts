import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';
import { RELATIONS_CALC_DEFAULT } from 'lib/echarts/converters/graphWide';
import { RelationsStatsPicker } from 'lib/grafana/editor/relations/RelationsStatsPicker';
import { type PanelOptions } from 'types';

/**
 * The mark reducers, applying to **nodes and edges alike** — a mark is a mark — which is
 * what the description promises and what `readNodes` / `readLinks` deliver.
 *
 * `calcs[0]` is the **main stat** and is the only one with a job outside the tooltip: it is
 * the number that sizes a node, colours it, and weighs an edge or a sankey ribbon. A chart
 * has one geometry, so that slot is singular by construction. Every calculation after it is a
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
 */
export function addRelationsStatOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addCustomEditor({
    id: 'reduceOptions.calcs',
    path: 'reduceOptions.calcs',
    name: t('relations.stats.name-calculation', 'Calculation'),
    description: t(
      'relations.stats.description-calculation',
      'How each node and edge reduces its values. The first sizes and colours the mark; the rest are extra tooltip rows'
    ),
    category: [t('stat.add-standard-data-reduce-options.category-value-options', 'Value options')],
    editor: RelationsStatsPicker,
    defaultValue: [RELATIONS_CALC_DEFAULT],
    settings: { allowMultiple: true },
  });
}
