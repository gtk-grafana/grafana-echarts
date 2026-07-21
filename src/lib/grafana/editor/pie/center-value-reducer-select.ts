import { fieldReducers, type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';
import { pieCenterValueReducerPath } from 'editor/constants';
import { addAdvancedSelect } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/** Grafana reducer options (id → display name) for the center-readout select. */
const reducerOptions: Array<SelectableValue<string>> = fieldReducers
  .list()
  .map((reducer) => ({ value: reducer.id, label: reducer.name, description: reducer.description }));

/**
 * Register the Advanced "Center value" reducer select in the "Advanced" category.
 * Only meaningful with `labelPosition: 'center'` (so it's revealed only then): the
 * chosen Grafana reducer aggregates the visible slice values into the persistent
 * donut-center readout. Unset leaves the center empty until a slice is hovered.
 * Rendered by `getPieCenterTitle`.
 */
export function addPieCenterValueReducerOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedSelect(builder, {
    path: pieCenterValueReducerPath,
    name: 'Center value',
    description: 'Reducer aggregating the slices into the donut-center readout (shown with center labels)',
    settings: { options: reducerOptions },
    showIf: (options) => options.labelPosition === 'center',
  });
}
