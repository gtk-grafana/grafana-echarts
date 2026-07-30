import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  STREAM_LABEL_FONT_SIZE_DEFAULT,
  STREAM_LABEL_MARGIN_DEFAULT,
  STREAM_SHOW_LABELS_DEFAULT,
  streamCategoryName,
  streamLabelFontSizePath,
  streamLabelMarginPath,
  streamShowLabelsPath,
} from 'editor/stream';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Whether the layer labels are on, so their position / font size only show once
 * there is a label to place. Reads the stored value against the plugin default
 * (off), not ECharts'.
 */
const isShowingStreamLabels = (options: PanelOptions) => options.streamShowLabels ?? STREAM_SHOW_LABELS_DEFAULT;

/**
 * Register the stream layer-label options: the Default-tier "Layer labels" switch
 * (ECharts `series.label.show`) plus the Advanced offset and font size that only
 * appear once labels are on.
 *
 * The switch is Default-tier because it is the first control a user reaches for:
 * ECharts draws these labels *by default*, at 11px in a hardcoded black, so the
 * plugin ships them off and this is how they come back — themed. Rendered by
 * `getStreamLabel`.
 *
 * There is no "position" control: ECharts 6.1.0 ignores
 * `series-themeRiver.label.position` and places the label from `margin` alone (see
 * `streamLabelMarginPath`), so a Left/Right radio would be a dead option.
 */
export function addStreamLabelOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addBooleanSwitch({
    path: streamShowLabelsPath,
    name: 'Layer labels',
    category: [streamCategoryName],
    description: 'Draw each ribbon’s name on the band. Off by default — the legend already names them.',
    defaultValue: STREAM_SHOW_LABELS_DEFAULT,
  });

  addAdvancedNumberInput(builder, {
    path: streamLabelMarginPath,
    name: 'Layer label offset',
    description: 'Horizontal offset (px) left of where the ribbon starts. Negative moves the label onto the ribbon.',
    defaultValue: STREAM_LABEL_MARGIN_DEFAULT,
    settings: { min: -100, max: 100, integer: true },
    showIf: isShowingStreamLabels,
  });

  addAdvancedNumberInput(builder, {
    path: streamLabelFontSizePath,
    name: 'Layer label font size',
    description: 'Font size (px) for the layer labels. Leave empty to use the theme default.',
    defaultValue: STREAM_LABEL_FONT_SIZE_DEFAULT,
    settings: { min: 6, max: 48, integer: true },
    showIf: isShowingStreamLabels,
  });
}
