import { PanelPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import { seriesTypePath } from 'editor/constants';

import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';

import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { removeOption } from 'lib/grafana/editor/common/removeOption';
import { addRelationsChordOptions } from 'lib/grafana/editor/relations/chord';
import { addRelationsCustomConfig } from 'lib/grafana/editor/relations/fieldConfig';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLabelOptions } from 'lib/grafana/editor/relations/labels';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { addRelationsStatOptions } from 'lib/grafana/editor/relations/stats';
import { addRelationsTimelineOptions } from 'lib/grafana/editor/relations/timeline';
import { setSystemTransformations } from 'lib/grafana/panelDataTransformations';
import { type PanelOptions } from 'types';
import { relationsDataTransformations } from './dataTransformations';
import { relationsSuggestionsSupplier } from './suggestions';

import {
  relationsCategoryName,
  relationsLayoutCategoryName,
  relationsSeriesTypeOptions,
} from 'editor/relations/constants';
import {
  RELATIONS_DISABLED_FIELD_OPTIONS,
  RELATIONS_FIELD_OPTIONS,
} from 'lib/grafana/editor/relations/standardOptions';
import { type EChartsRelationsFieldConfig } from 'editor/relations/types';
import { isGraphVariant } from 'editor/relations/variants';
// Needs to be called at each top-level module to prevent panels from breaking when
// calling grafana/i18n methods (like t()). `addRelationsStatOptions` calls `t()` while
// the options supplier runs, and the plugin bundles its own `@grafana/i18n` (it is not
// in the shared externals list), so without this the supplier throws
// "t() was called before i18n was initialized" — which surfaces as a panel stuck
// forever on "Loading plugin panel...", with no error anywhere in the UI.

initPluginTranslations('grafana-echarts-app');

// Relations family panel: nodes plus the links between them, read from the field-based
// graph contract — one node is one field, one edge is one field. Three render variants —
// `graph`, `sankey` and `chord` — over one converter, since all three ECharts series
// consume the identical node/link input. See data-plane/graph-wide.md and
// lib/echarts/relations/converters/graphWide.ts. Grafana's row-based node-graph frames are
// converted to the contract above the panel, by the transformation registered below.
const relationsPlugin = new PanelPlugin<PanelOptions, EChartsRelationsFieldConfig>(makeLazyPanel('relations'))
  .useFieldConfig({
    // The shared block minus "Color series by", which has nothing to act on here, and
    // with "Display name" hidden from the defaults tab because it is only ever useful
    // per field. See `RELATIONS_FIELD_OPTIONS`.
    standardOptions: RELATIONS_FIELD_OPTIONS,
    // Properties nothing on this contract can act on: Actions is read nowhere, and
    // "No value" is unreachable because no null survives to the formatter. Offered and
    // inert is worse than absent. See `RELATIONS_DISABLED_FIELD_OPTIONS`.
    disableStandardOptions: RELATIONS_DISABLED_FIELD_OPTIONS,
    // Per-mark style, addressable by an ordinary field override because a mark is a
    // field: node radius, subtitle and pinned position; edge width, line type and
    // curveness; the two ad-hoc filter label keys; and the real "Hide in area"
    // switches. See `addRelationsCustomConfig`.
    useCustomConfig: addRelationsCustomConfig,
  })
  .setPanelOptions((builder) => {
    /**
     * Supplier order **is** the editor order: a category appears in the pane where it is
     * first registered, and options appear within it in registration order. The sections
     * below read top to bottom as: what kind of chart, what number a mark stands for,
     * what text it carries, where it sits, what the reader can do to it, how its edges
     * look, then the two variant-specific groups. See `relationsCategoryName` and
     * friends for why the family groups by purpose rather than by tier.
     */

    // "Chart type" picker, registered only once the family hosts more than one
    // render type (sankey/chord). Mirrors the multivariate panel's `length > 1`
    // gate, so a single-variant family shows no redundant radio. Creates the
    // "Relations" section, which the editor-mode switch is appended to at the end.
    if (relationsSeriesTypeOptions.length > 1) {
      builder.addRadio({
        path: seriesTypePath,
        name: 'Chart type',
        category: [relationsCategoryName],
        defaultValue: 'graph',
        settings: { options: relationsSeriesTypeOptions },
      });
    }

    // "Value": the two alternative answers to "what one number stands for this mark".
    // The slider is the prior question and is registered first — on, it hides the
    // reducer picker, because at one selected row there is nothing left to reduce. See
    // `addRelationsTimelineOptions` and `addRelationsStatOptions`.
    addRelationsTimelineOptions(builder);
    addRelationsStatOptions(builder);

    // "Labels": what text a mark carries and what happens when it does not fit.
    // `addRelationsLinkOptions` appends "Show edge values" to this section later — it is
    // the same question for an edge.
    addRelationsLabelOptions(builder);

    // "Layout": the layout choice and node size, then the force tuning that only
    // applies to one of those choices, then the animation switch. Registered in that
    // order so the section reads from the decision down to its tuning.
    addRelationsLayoutOptions(builder);
    addRelationsForceOptions(builder);
    /**
     * The family has no per-point fast path, so it takes the shared animation switch
     * rather than the cartesian `addPerformanceOptions` bundle — into its own Layout
     * section rather than the shared "Advanced" one. Off by default, like every other
     * family: a panel that animates by default animates on every dashboard refresh, not
     * only on the load where the effect was wanted.
     *
     * **Hidden on the graph variant, where ECharts ignores it.** `GraphView` writes node
     * and edge positions directly and consults `isAnimationEnabled()` nowhere, so the
     * switch would draw nothing there while "Animate layout" (`force.layoutAnimation`,
     * from `addRelationsForceOptions`) sat beside it doing the job — two animation
     * controls of which one is dead. Sankey and chord do honour it, so it stays for them.
     * See `addAnimationOption`.
     */
    addAnimationOption(builder, {
      category: [relationsLayoutCategoryName],
      showIf: (options) => !isGraphVariant(options),
    });

    // "Interaction": zoom, pan and remember-view are Default-tier — on a topology that
    // does not fit the panel they are how the rest of the data is reachable, not expert
    // tuning. See `addRelationsInteractionOptions`.
    addRelationsInteractionOptions(builder);

    // "Edges": link colour and the arrowhead switch (both Default-tier), then the
    // graph-only curvature tuning. Also appends the edge-value switch to "Labels".
    addRelationsLinkOptions(builder);

    // The two variant-specific sections, each hidden wholesale on the other variants.
    // "Sankey" keeps two Default-tier layout controls; "Chord" is entirely Advanced,
    // since none of the ring geometry is needed to read the chart.
    addRelationsSankeyOptions(builder);
    addRelationsChordOptions(builder);

    // `singleOnly`: a relations hover is one node or one link, so "All" has nothing
    // to list. `includeLegendCalcs: false`: a legend entry is one mark, already
    // reduced to its own stat by `reduceOptions`, so there is nothing further to
    // reduce per legend row. Matches `singleTooltipOnly` on `relationsChartModule`,
    // which clamps a persisted `multi` at render time.
    addCommonLegendAndTooltip(builder, { singleTooltipOnly: true, includeLegendCalcs: false });

    /**
     * Both of these are **unreachable here**, so they are unregistered rather than left
     * in the pane doing nothing. `commonOptionsBuilder.addTooltipOptions` adds the pair
     * unconditionally, and core gates both on `tooltip.mode === 'multi'` — which
     * `singleTooltipOnly` has just removed from the mode picker. So the controls render
     * (they carry no `showIf` of their own beyond the multi check) with no reachable
     * state in which they act.
     */
    removeOption(builder, 'tooltip.sort');
    removeOption(builder, 'tooltip.hideZeros');

    // Editor mode **last**, and inside "Relations" — with no category Grafana files it
    // under a section named after the plugin, so the panel grew an "ECharts Relations"
    // section holding one radio beside its real "Relations" one. It is a meta-control
    // about the pane rather than about the chart, so the foot of the first section is
    // where it belongs. See `addEditorModeOption`.
    addEditorModeOption(builder, [relationsCategoryName]);
    return builder;
  })
  // Registered for consistency; it never returns a suggestion — see suggestions.ts.
  .setSuggestionsSupplier(relationsSuggestionsSupplier);

/**
 * Declare the row->field conversion as a panel-registered transformation so it runs
 * *above* the panel, before field overrides — which is what makes each node and edge a
 * `byName` override target and lists them in the override editor's field picker.
 *
 * This is the family's **only** path from Grafana's row-based node-graph frames to
 * something the panel can read, so the API is a hard requirement rather than an
 * enhancement: the plugin's minimum supported Grafana is the release that carries
 * grafana/grafana#129992 (expected 13.2). Registration is feature-detected so an older
 * host does not fail to load the plugin at all, but a row-format response there reaches
 * the panel unconverted and the panel reports that it cannot read it — see
 * `frameToRelationsGraph`. A user on such a host can supply the conversion by hand with
 * a "Rows to fields" transformation. See `lib/grafana/panelDataTransformations.ts`.
 */
export const plugin = setSystemTransformations(relationsPlugin, relationsDataTransformations);
