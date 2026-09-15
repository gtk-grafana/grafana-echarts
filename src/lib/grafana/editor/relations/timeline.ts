import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';

import { type PanelOptions } from 'types';

import { RELATIONS_TIME_SLIDER_DEFAULT } from 'editor/relations/constants';
import { hasGraphTimeline } from 'lib/echarts/relations/converters/timeStops';
/** The time slider: read every mark at one timestamp instead of reducing its rows away. */
export function addRelationsTimelineOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: 'relationsTimeSlider',
    name: t('relations.timeline.name-time-slider', 'Time slider'),
    description: t(
      'relations.timeline.description-time-slider',
      'Read each mark at one timestamp instead of calculating over the range. Replaces Calculation. Needs ranged data'
    ),
    category: [t('relations.category-value', 'Value')],
    defaultValue: RELATIONS_TIME_SLIDER_DEFAULT,
    /** Show this option only for data with a usable timeline. */
    showIf: (options, data) => options.relationsTimeSlider === true || hasGraphTimeline(data),
  });
}
