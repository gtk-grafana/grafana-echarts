import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { advancedOptionsCategoryName } from 'editor/constants';
import { isGraphVariant, isSankeyVariant } from 'editor/sankey';
import {
  RELATIONS_EDGE_ARROWS_DEFAULT,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
} from 'lib/echarts/options/graph';
import {
  addAdvancedBooleanSwitch,
  addAdvancedNumberInput,
  showIfAdvanced,
} from 'lib/grafana/editor/common/advanced-options';
import { RelationsLinkColorEditor } from 'lib/grafana/editor/relations/RelationsLinkColorEditor';
import { type PanelOptions } from 'types';

/**
 * Link (edge) styling options, all Advanced. A colour on the edge's own field always
 * wins over the mode chosen here — see `isPaletteColorMode` for which modes count, and
 * `RelationsLinkColorEditor` for where the control says so.
 *
 * "Link color" is shared by all three render variants, and is the one control here with
 * its own editor component: its choices depend on the variant and the layout. Edge arrows
 * and curveness are graph-only — `SankeySeriesOption` has no `edgeSymbol` at all (a ribbon
 * carries its direction by shape), and sankey curveness is a separate option because its
 * ECharts default differs (see `addRelationsSankeyOptions`). "Show edge values" covers
 * graph and sankey but not chord.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
export function addRelationsLinkOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  // On by default: an edge is directed by contract, and on a force layout the
  // arrowhead is the only thing that says which way — the source-to-target gradient
  // cannot be oriented there. See `RELATIONS_EDGE_ARROWS_DEFAULT`.
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsEdgeArrows',
    name: 'Edge arrows',
    description: 'Draw an arrowhead at the target end so direction is readable',
    defaultValue: RELATIONS_EDGE_ARROWS_DEFAULT,
    showIf: isGraphVariant,
  });

  // Graph and sankey only. `ChordEdge` builds no text element at all, so the key
  // would be inert on a chord — see `getRelationsEdgeLabel`.
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsShowEdgeValues',
    name: 'Show edge values',
    description: "Draw each link's weight on the link itself",
    defaultValue: RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
    showIf: (options) => isGraphVariant(options) || isSankeyVariant(options),
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsCurveness',
    name: 'Link curveness',
    description: 'Curve links (0-1). Separates the two directions of a bidirectional pair',
    showIf: isGraphVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });

  // Gradient by default on every variant. Registered by hand rather than through
  // `addAdvancedSelect` because the control is a component — the Advanced category and
  // the editor-mode gate are the only things those helpers add, and both are restated
  // here. See `RelationsLinkColorEditor`.
  builder.addCustomEditor({
    id: 'relationsLinkColor',
    path: 'relationsLinkColor',
    name: 'Link color',
    description: 'Which node a link inherits its color from',
    category: [advancedOptionsCategoryName],
    editor: RelationsLinkColorEditor,
    defaultValue: RELATIONS_LINK_COLOR_DEFAULT,
    showIf: showIfAdvanced(),
  });
}
