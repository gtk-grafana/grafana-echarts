import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  isSankeyVariant,
  SANKEY_CURVENESS_DEFAULT,
  SANKEY_LAYOUT_ITERATIONS_DEFAULT,
  SANKEY_LINK_OPACITY_DEFAULT,
  SANKEY_NODE_ALIGN_DEFAULT,
  SANKEY_NODE_GAP_DEFAULT,
  SANKEY_NODE_WIDTH_DEFAULT,
  SANKEY_ORIENT_DEFAULT,
  sankeyCategoryName,
  sankeyCurvenessPath,
  sankeyLayoutIterationsPath,
  sankeyLinkOpacityPath,
  sankeyNodeAlignOptions,
  sankeyNodeAlignPath,
  sankeyNodeGapPath,
  sankeyNodeWidthPath,
  sankeyOrientOptions,
  sankeyOrientPath,
} from 'editor/sankey';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Sankey layout options. Every control gates on `isSankeyVariant`, so they vanish
 * when the panel renders the `graph` variant instead.
 *
 * The two Default-tier controls live in a dedicated always-visible "Sankey"
 * category, mirroring the funnel's — sankey has no core Grafana equivalent, so its
 * primary layout controls are first-class rather than Advanced-gated. The finer
 * geometry and ribbon-styling knobs are Advanced, like the graph variant's force
 * tuning.
 *
 * https://echarts.apache.org/en/option.html#series-sankey
 */
export function addRelationsSankeyOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addRadio({
    path: sankeyOrientPath,
    name: 'Flow direction',
    description: 'Lay the node columns out left to right, or top to bottom',
    category: [sankeyCategoryName],
    defaultValue: SANKEY_ORIENT_DEFAULT,
    settings: { options: sankeyOrientOptions },
    showIf: isSankeyVariant,
  });

  builder.addRadio({
    path: sankeyNodeAlignPath,
    name: 'Node alignment',
    description: 'Where to place nodes that could sit in more than one column',
    category: [sankeyCategoryName],
    defaultValue: SANKEY_NODE_ALIGN_DEFAULT,
    settings: { options: sankeyNodeAlignOptions },
    showIf: isSankeyVariant,
  });

  addAdvancedNumberInput(builder, {
    path: sankeyNodeWidthPath,
    name: 'Node width',
    description: 'Thickness of each node bar in px',
    defaultValue: SANKEY_NODE_WIDTH_DEFAULT,
    showIf: isSankeyVariant,
    settings: { min: 1, step: 1 },
  });

  addAdvancedNumberInput(builder, {
    path: sankeyNodeGapPath,
    name: 'Node gap',
    description: 'Space in px between adjacent nodes in the same column',
    defaultValue: SANKEY_NODE_GAP_DEFAULT,
    showIf: isSankeyVariant,
    settings: { min: 0, step: 1 },
  });

  addAdvancedNumberInput(builder, {
    path: sankeyCurvenessPath,
    name: 'Ribbon curveness',
    description: 'How much each flow ribbon bows between its endpoints (0-1)',
    defaultValue: SANKEY_CURVENESS_DEFAULT,
    showIf: isSankeyVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });

  addAdvancedNumberInput(builder, {
    path: sankeyLinkOpacityPath,
    name: 'Ribbon opacity',
    description: 'Translucency of the flow ribbons (0-1). Raise it when few ribbons overlap',
    defaultValue: SANKEY_LINK_OPACITY_DEFAULT,
    showIf: isSankeyVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });

  addAdvancedNumberInput(builder, {
    path: sankeyLayoutIterationsPath,
    name: 'Layout iterations',
    description: 'Passes spent refining node positions to reduce ribbon crossings',
    defaultValue: SANKEY_LAYOUT_ITERATIONS_DEFAULT,
    showIf: isSankeyVariant,
    settings: { min: 0, step: 1 },
  });
}
