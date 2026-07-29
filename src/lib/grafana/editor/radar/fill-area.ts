import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isRadarSelected, RADAR_FILL_AREA_DEFAULT, radarCategoryName, radarFillAreaPath } from 'editor/radar';
import { type PanelOptions } from 'types';

/**
 * Register the Default-tier radar "Fill area" switch (ECharts `series.areaStyle`):
 * fill each polygon with a translucent tint rather than outlining it. Always
 * visible (a common radar choice). Rendered by `getRadarAreaStyle`.
 */
export function addRadarFillAreaOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addBooleanSwitch({
    path: radarFillAreaPath,
    name: 'Fill area',
    category: [radarCategoryName],
    description: 'Fill each polygon with a translucent tint',
    defaultValue: RADAR_FILL_AREA_DEFAULT,
    showIf: isRadarSelected,
  });
}
