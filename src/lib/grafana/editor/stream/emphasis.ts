import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { STREAM_EMPHASIS_FOCUS_DEFAULT, streamEmphasisFocusOptions, streamEmphasisFocusPath } from 'editor/stream';
import { addAdvancedSelect } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced stream "Hover emphasis" select (None / Self / Series;
 * ECharts `series.emphasis.focus`). `Self` fades every other ribbon, which is the
 * one that pays off here: tracing a single band through a busy river is the whole
 * point of the viz. Rendered by `getStreamEmphasis`, which omits the key at `none`.
 */
export function addStreamEmphasisOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedSelect(builder, {
    path: streamEmphasisFocusPath,
    name: 'Hover emphasis',
    description: 'On hover, fade the other ribbons (Self) or highlight the whole river (Series)',
    defaultValue: STREAM_EMPHASIS_FOCUS_DEFAULT,
    settings: { options: streamEmphasisFocusOptions },
  });
}
