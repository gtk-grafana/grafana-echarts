import { type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';
import { relationsCategoryName } from 'editor/constants';
import { isGraphVariant } from 'editor/sankey';
import { type RelationsGraphLayout } from 'editor/types';
import { RELATIONS_LAYOUT_DEFAULT } from 'lib/echarts/options/graph';
import { type PanelOptions } from 'types';

/**
 * Graph layout (ECharts `series.graph.layout`), Default tier — the closest
 * equivalent to core Grafana's Node graph "Layout" option.
 *
 * Graph-only: a sankey self-layouts into columns and has no comparable choice, so
 * the control is hidden there rather than shown inert.
 * https://echarts.apache.org/en/option.html#series-graph.layout
 */
const layoutOptions: Array<SelectableValue<RelationsGraphLayout>> = [
  { value: 'force', label: 'Force', description: 'Physics simulation; good for exploring topology' },
  { value: 'circular', label: 'Circular', description: 'Nodes on a ring; stable and deterministic' },
  {
    value: 'none',
    label: 'Fixed',
    description: 'Pin nodes at their fixed x/y; any node without a pair is seeded on a ring',
  },
];

export function addRelationsLayoutOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addRadio({
    path: 'relationsLayout',
    name: 'Layout',
    description: 'How nodes are positioned. Defaults to Fixed when every node supplies fixedx/fixedy',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_LAYOUT_DEFAULT,
    settings: { options: layoutOptions },
    showIf: isGraphVariant,
  });
}
