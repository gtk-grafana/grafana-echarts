import { type StandardEditorProps } from '@grafana/data';
import { RadioButtonGroup } from '@grafana/ui';
import React from 'react';

import { RELATIONS_LAYOUT_DEFAULT } from 'editor/relations/constants';
import { type RelationsGraphLayout } from 'editor/relations/types';
import { type PanelOptions } from 'types';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';

/**
 * Graph layout (ECharts `series.graph.layout`) — the closest equivalent to core
 * Grafana's Node graph "Layout" option, so the control itself is Default-tier.
 *
 * **Force and Circular always; Fixed only in Advanced mode.** Fixed is not a layout the
 * panel can satisfy on its own: it pins each node at its `custom.fixedX`/`fixedY` and
 * seeds anything without a pair on a ring, so choosing it without having supplied or
 * overridden those coordinates gives a ring of unplaced nodes rather than a layout. That
 * makes it an expert choice sitting in the middle of two that work on any data.
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

/**
 * The choices to offer.
 *
 * `Fixed` is offered in Advanced mode — **or whenever it is already the stored value**,
 * whatever the mode. `relationsLayout` is Default-tier so it is not in
 * `ADVANCED_RELATIONS_DEFAULTS` and is never reset, which means a panel saved as Fixed
 * in Advanced mode still renders Fixed after switching back. Dropping the entry there
 * would leave the radio with no button selected and no way to change it from the pane.
 * Same reasoning as the time slider's `|| options.relationsTimeSlider === true` gate.
 */
export function layoutChoices(options: Partial<PanelOptions> = {}) {
  if (isAdvancedEditorMode(options) || options.relationsLayout === ADVANCED_LAYOUT_CHOICE) {
    return layoutChoiceOptions;
  }
  return layoutChoiceOptions.filter(({ value }) => value !== ADVANCED_LAYOUT_CHOICE);
}

/**
 * A component rather than the standard `radio` editor id because the **choice list is
 * contextual**, and this is the only place it can be: `settings.options` is read once at
 * registration, and `settings.getOptions` is re-run only when `context.data` changes
 * (`SelectValueEditor`), so neither notices an editor-mode switch. A component re-renders
 * whenever the panel options do, since the whole pane is rebuilt from them. Exactly the
 * reasoning behind `RelationsLinkColorEditor`.
 */
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
