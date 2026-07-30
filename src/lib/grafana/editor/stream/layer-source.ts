import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  STREAM_LAYER_SOURCE_DEFAULT,
  streamCategoryName,
  streamLayerSourceOptions,
  streamLayerSourcePath,
} from 'editor/stream';
import { type PanelOptions } from 'types';

/**
 * Register the Default-tier stream "Layers from" radio (Auto / Fields / Labels):
 * which column of the response becomes a ribbon.
 *
 * Default tier rather than Advanced because it is the difference between a real
 * stream and one flat ribbon: `Auto` reads a long-shaped frame (time + exactly one
 * numeric + a string column) by pivoting that string column, and anything else as
 * one layer per numeric field. Both explicit modes exist because the ambiguous
 * case is real — a SQL table of `time, level, count, errors` legitimately means
 * either. Read by `frameToStream`; see `data-plane/stream.md`.
 */
export function addStreamLayerSourceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: streamLayerSourcePath,
    name: 'Layers from',
    category: [streamCategoryName],
    description: 'Where each ribbon comes from: one per numeric field, or one per value of a label column',
    defaultValue: STREAM_LAYER_SOURCE_DEFAULT,
    settings: { options: streamLayerSourceOptions },
  });
}
