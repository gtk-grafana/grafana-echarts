import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';

import { resolveRelationsTimeSlider } from 'lib/echarts/relations/options/timeSlider';
import { RelationsStatsPicker } from 'lib/grafana/editor/relations/RelationsStatsPicker';
import { type PanelOptions } from 'types';

import { RELATIONS_CALC_DEFAULT } from 'editor/relations/constants';
/** The mark reducers, applying to nodes and edges alike. */
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
