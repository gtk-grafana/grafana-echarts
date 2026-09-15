import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { type PanelOptions } from 'types';

import {
  RELATIONS_LAYOUT_DEFAULT,
  RELATIONS_NODE_SIZE_DEFAULT,
  relationsLayoutCategoryName,
} from 'editor/relations/constants';
import { isGraphVariant } from 'editor/relations/variants';
import { RelationsLayoutEditor } from 'lib/grafana/editor/relations/RelationsLayoutEditor';
/**
 * The "Layout" section: where marks are positioned and how big they are.
 * https://echarts.apache.org/en/option.html#series-graph.layout
 * https://echarts.apache.org/en/option.html#series-graph.symbolSize
 */
export function addRelationsLayoutOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  // The custom editor hides Fixed mode from the default option tier.
  builder.addCustomEditor({
    id: 'relationsLayout',
    path: 'relationsLayout',
    name: 'Layout',
    description: 'How nodes are positioned. Defaults to Fixed when every node supplies fixedx/fixedy',
    category: [relationsLayoutCategoryName],
    editor: RelationsLayoutEditor,
    defaultValue: RELATIONS_LAYOUT_DEFAULT,
    showIf: isGraphVariant,
  });

  builder.addSliderInput({
    path: 'relationsNodeSize',
    name: 'Node size',
    description: 'Node diameter in px. Nodes supplying noderadius keep their own size',
    category: [relationsLayoutCategoryName],
    defaultValue: RELATIONS_NODE_SIZE_DEFAULT,
    settings: { min: 4, max: 80, step: 1 },
    showIf: isGraphVariant,
  });
}
