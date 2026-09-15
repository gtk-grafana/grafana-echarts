import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { RelationsLinkColorEditor } from 'lib/grafana/editor/relations/RelationsLinkColorEditor';
import { type PanelOptions } from 'types';

import {
  RELATIONS_EDGE_ARROWS_DEFAULT,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
  relationsEdgesCategoryName,
  relationsLabelsCategoryName,
} from 'editor/relations/constants';
import { isGraphVariant, isSankeyVariant } from 'editor/relations/variants';
/**
 * Edge styling — the "Edges" section.
 *
 * The section is **Edges, not Links**: "Data links" is a standard field-config option,
 * and a section called "Links" beside it would read as being about URLs rather than
 * about the lines between nodes. The ECharts key is still `series.links`, which is why
 * the file and the option paths keep that word.
 *
 * "Link color" and "Edge arrows" are the Default-tier pair that live here — an edge's
 * colour and its direction marker. Only "Link curveness" is still Advanced.
 *
 * "Show edge values" is registered by this file but into **Labels**: it answers the same
 * question "Show node labels" and "Show node values" answer — what text is drawn on a
 * mark — so that is where an editor looks for it. The arrowhead is not text, and is not
 * optional in the same sense: it is how a directed edge reads at all. `SankeySeriesOption` has no `edgeSymbol` at all (a
 * ribbon carries its direction by shape), and sankey curveness is a separate option
 * because its ECharts default differs (see `addRelationsSankeyOptions`).
 *
 * A colour on the edge's own field always wins over the mode chosen here — see
 * `isPaletteColorMode` for which modes count, and `RelationsLinkColorEditor` for where
 * the control says so.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
const edgesCategory = [relationsEdgesCategoryName];

export function addRelationsLinkOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  /**
   * Gradient by default on every variant, and **Default-tier**. Registered by hand
   * rather than through a builder helper because the control is a component — its
   * choice list depends on the variant and the layout. See `RelationsLinkColorEditor`.
   */
  builder.addCustomEditor({
    id: 'relationsLinkColor',
    path: 'relationsLinkColor',
    name: 'Link color',
    description: 'Which node a link inherits its color from',
    category: edgesCategory,
    editor: RelationsLinkColorEditor,
    defaultValue: RELATIONS_LINK_COLOR_DEFAULT,
  });

  /**
   * **Default-tier**, and on by default: an edge is directed by contract
   * (`source`/`target`), and on a force layout the arrowhead is the *only* thing that
   * says which way — the source-to-target gradient cannot be oriented without knowing
   * the node positions. Something the chart is unreadable without is not an expert
   * setting, so it is not gated behind Advanced. See `RELATIONS_EDGE_ARROWS_DEFAULT`.
   *
   * Graph-only: `SankeySeriesOption` has no `edgeSymbol` (a ribbon carries its direction
   * by shape) and `ChordEdge` none either.
   */
  builder.addBooleanSwitch({
    path: 'relationsEdgeArrows',
    name: 'Edge arrows',
    description: 'Draw an arrowhead at the target end so direction is readable',
    category: edgesCategory,
    defaultValue: RELATIONS_EDGE_ARROWS_DEFAULT,
    showIf: isGraphVariant,
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsCurveness',
    name: 'Link curveness',
    description: 'Curve links (0-1). Separates the two directions of a bidirectional pair',
    category: edgesCategory,
    showIf: isGraphVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });

  /**
   * **Registered into "Labels", not here.** It answers the same question "Show node
   * labels" and "Show node values" answer — what text is drawn on a mark — and an editor
   * hunting for it looks under Labels. It stays in this file because everything else
   * about an edge is here; the section is chosen by what the control *is*, not by which
   * supplier registers it.
   *
   * Off by default: one number per link buries a graph of any size
   * (`RELATIONS_SHOW_EDGE_VALUES_DEFAULT`). Default-tier means the switch is *reachable*
   * without Advanced mode, not that it is on.
   *
   * Graph and sankey only. `ChordEdge` builds no text element at all, so the key would
   * be inert on a chord — see `getRelationsEdgeLabel`.
   */
  builder.addBooleanSwitch({
    path: 'relationsShowEdgeValues',
    name: 'Show edge values',
    description: "Draw each link's weight on the link itself",
    category: [relationsLabelsCategoryName],
    defaultValue: RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
    showIf: (options) => isGraphVariant(options) || isSankeyVariant(options),
  });
}
