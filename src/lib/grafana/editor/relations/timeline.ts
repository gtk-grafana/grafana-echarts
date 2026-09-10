import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';
import { hasGraphTimeline } from 'lib/echarts/converters/graphWide';
import { RELATIONS_TIME_SLIDER_DEFAULT } from 'lib/echarts/options/timeline';
import { type PanelOptions } from 'types';

/**
 * The time slider: read every mark at **one timestamp** instead of reducing its rows away.
 *
 * Registered in "Value options" beside the picker it replaces, because the two are
 * alternative answers to one question — `reduceOptions.calcs[0]` gives the number that
 * stands for a mark's whole timeline, this gives the graph as it was at 14:32 — so the
 * picker is hidden while the slider is on (`addRelationsStatOptions`).
 *
 * The slider itself is drawn in the panel body: it is a *selection*, not a setting, and
 * writing it into the options would mark the dashboard dirty on every step. See
 * `ChartTimeSlider` and `ChartModule.getTimeline`.
 */
export function addRelationsTimelineOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: 'relationsTimeSlider',
    name: t('relations.timeline.name-time-slider', 'Time slider'),
    description: t(
      'relations.timeline.description-time-slider',
      'Read each mark at one timestamp instead of calculating over the range. Needs ranged data'
    ),
    category: [t('stat.add-standard-data-reduce-options.category-value-options', 'Value options')],
    defaultValue: RELATIONS_TIME_SLIDER_DEFAULT,
    /**
     * Hidden unless the response has somewhere to scrub to, like "Show node values" gating
     * on `hasNoNodeStats` — otherwise the switch appears on every instant panel, where
     * turning it on only hides the reducer picker and posts an advisory.
     *
     * **Except when already on**, which is what the `||` is for: the timeline comes and goes
     * with the data, and taking the switch away while it is set would leave a hidden reducer
     * picker and no control to undo it.
     */
    showIf: (options, data) => options.relationsTimeSlider === true || hasGraphTimeline(data),
  });
}
