import { PanelPlugin } from '@grafana/data';
import { relationsCategoryName, relationsSeriesTypeOptions, seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsNodeOptions } from 'lib/grafana/editor/relations/nodes';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { type PanelOptions } from 'types';
import { relationsSuggestionsSupplier } from './suggestions';

// Relations family panel: nodes plus the links between them, built from Grafana's
// node-graph frame pair (an edges frame, plus an optional nodes frame). The `graph`
// and `sankey` render variants ship; `chord` is a planned third, since all three
// ECharts series consume the identical node/link input. See
// data-plane/node-graph.md and lib/echarts/converters/nodeGraph.ts.
export const plugin = new PanelPlugin<PanelOptions, EChartsFieldConfig>(makeLazyPanel('relations'))
  .useFieldConfig({
    standardOptions: STANDARD_COLOR_OPTIONS,
    // No `useCustomConfig`/`addHideFrom`: nodes are frame *rows*, not fields, so a
    // byName `custom.hideFrom` override would never match one and
    // `stripHiddenValueFields` could only strip the underlying stat column. The
    // hierarchy family omits it for the same reason; see parity.md.
  })
  .setPanelOptions((builder) => {
    // Editor mode (Default / Advanced) — registered first so it renders at the top.
    // See docs/options-modes.md.
    addEditorModeOption(builder);

    // "Chart type" picker, registered only once the family hosts more than one
    // render type (sankey/chord). Mirrors the multivariate panel's `length > 1`
    // gate, so a single-variant family shows no redundant radio.
    if (relationsSeriesTypeOptions.length > 1) {
      builder.addRadio({
        path: seriesTypePath,
        name: 'Chart type',
        category: [relationsCategoryName],
        defaultValue: 'graph',
        settings: { options: relationsSeriesTypeOptions },
      });
    }

    // Default tier: layout and node presentation — the controls a user coming from
    // core Grafana's Node graph panel expects. Each graph-only control gates on
    // `isGraphVariant` internally.
    addRelationsLayoutOptions(builder);
    addRelationsNodeOptions(builder);

    // Sankey-only: its Default-tier layout controls get a dedicated always-visible
    // category, plus Advanced geometry/ribbon knobs. Every control gates on
    // `isSankeyVariant` internally, mirroring the funnel variant's options.
    addRelationsSankeyOptions(builder);

    // Advanced tier: interaction, force tuning, link styling.
    addRelationsInteractionOptions(builder);
    addRelationsForceOptions(builder);
    addRelationsLinkOptions(builder);

    // The family has no per-point fast path, so it registers the shared animation
    // switch directly rather than the cartesian `addPerformanceOptions` bundle.
    addAnimationOption(builder);

    // `singleOnly`: a relations hover is one node or one link, so "All" has nothing
    // to list. `includeLegendCalcs: false`: legend entries are nodes (rows), not
    // fields, so there is no series to reduce. Matches `singleTooltipOnly` on
    // `relationsChartModule`, which clamps a persisted `multi` at render time.
    addCommonLegendAndTooltip(builder, { singleTooltipOnly: true, includeLegendCalcs: false });
    return builder;
  })
  // Registered for consistency; it never returns a suggestion — see suggestions.ts.
  .setSuggestionsSupplier(relationsSuggestionsSupplier);
