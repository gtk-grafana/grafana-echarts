import { type StandardEditorProps } from '@grafana/data';
import { RadioButtonGroup } from '@grafana/ui';
import React from 'react';

import { RELATIONS_LAYOUT_DEFAULT } from 'editor/relations/constants';
import { type RelationsGraphLayout } from 'editor/relations/types';
import { type PanelOptions } from 'types';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';

/**
 * Graph layout (ECharts `series.graph.layout`).
 * https://echarts.apache.org/en/option.html#series-graph.layout
 */
export const layoutChoiceOptions: Array<{
  value: RelationsGraphLayout;
  label: string;
  description: string;
}> = [
  { value: 'force', label: 'Force', description: 'Physics simulation; good for exploring topology' },
  { value: 'circular', label: 'Circular', description: 'Nodes on a ring; stable and deterministic' },
  {
    value: 'none',
    label: 'Fixed',
    description: 'Pin nodes at their fixed x/y; any node without a pair is seeded on a ring',
  },
];

/** The advanced-only choice, named once so the editor and its test agree. */
export const ADVANCED_LAYOUT_CHOICE: RelationsGraphLayout = 'none';

/** The choices to offer. */
export function layoutChoices(options: Partial<PanelOptions> = {}) {
  if (isAdvancedEditorMode(options) || options.relationsLayout === ADVANCED_LAYOUT_CHOICE) {
    return layoutChoiceOptions;
  }
  return layoutChoiceOptions.filter(({ value }) => value !== ADVANCED_LAYOUT_CHOICE);
}

/** Layout picker with choices based on the editor mode. */
export const RelationsLayoutEditor: React.FC<StandardEditorProps<RelationsGraphLayout, unknown, PanelOptions>> = ({
  value,
  onChange,
  context,
  id,
}) => (
  <RadioButtonGroup<RelationsGraphLayout>
    id={id}
    value={value ?? RELATIONS_LAYOUT_DEFAULT}
    options={layoutChoices(context.options)}
    onChange={onChange}
    fullWidth
  />
);
