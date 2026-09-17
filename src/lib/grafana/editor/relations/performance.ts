import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { relationsPerformanceCategoryName } from 'editor/relations/constants';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/** Add the Relations performance safety control. */
export function addRelationsPerformanceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedNumberInput(builder, {
    path: 'relationsMaxMarks',
    name: 'Max nodes + edges',
    description: `Override default safety limits. A value set here replaces the automatic node and mark limits.`,
    category: [relationsPerformanceCategoryName],
    settings: { step: 1, integer: true, placeholder: '' },
  });
}
