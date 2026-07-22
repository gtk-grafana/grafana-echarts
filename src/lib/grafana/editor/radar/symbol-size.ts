import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isRadarSelected, RADAR_SYMBOL_SIZE_DEFAULT, radarSymbolSizePath } from 'editor/radar';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced radar "Symbol size" input (px; ECharts
 * `series.symbolSize`). `0` hides the vertex markers; empty uses ECharts'
 * default. Rendered by `getRadarSymbol`.
 */
export function addRadarSymbolSizeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: radarSymbolSizePath,
    name: 'Symbol size',
    description: 'Marker size at each polygon vertex (px). 0 hides the markers.',
    defaultValue: RADAR_SYMBOL_SIZE_DEFAULT,
    settings: { min: 0, max: 40, integer: true },
    showIf: isRadarSelected,
  });
}
