import { type FieldConfigEditorBuilder } from '@grafana/data';

import { SOURCE_LABEL, TARGET_LABEL } from 'lib/echarts/relations/converters/contract';
import { type EChartsRelationsFieldConfig } from 'editor/relations/types';

/** Their own section rather than "Node" or "Edge": both kinds of mark read them. */
const FILTER_CATEGORY = ['Ad-hoc filters (deprecated)'];

export function addRelationsFilterConfig(builder: FieldConfigEditorBuilder<EChartsRelationsFieldConfig>): void {
  builder
    .addTextInput({
      path: 'sourceFilterLabel',
      name: 'Source filter label',
      description:
        'Deprecated, and due to be removed: keep the original label in the query instead — ' +
        `the panel recovers it per edge. Label an ad-hoc filter writes this mark's source endpoint under. Read from the response otherwise, or "${SOURCE_LABEL}"`,
      category: FILTER_CATEGORY,
      settings: { placeholder: SOURCE_LABEL },
      hideFromDefaults: true,
    })
    .addTextInput({
      path: 'targetFilterLabel',
      name: 'Target filter label',
      description:
        'Deprecated, and due to be removed: keep the original label in the query instead — ' +
        `the panel recovers it per edge. Label an ad-hoc filter writes this mark's target endpoint under. Read from the response otherwise, or "${TARGET_LABEL}"`,
      category: FILTER_CATEGORY,
      settings: { placeholder: TARGET_LABEL },
      hideFromDefaults: true,
    });
}
