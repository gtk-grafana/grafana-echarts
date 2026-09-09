import { PanelPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';
import { relationsCategoryName, relationsSeriesTypeOptions, seriesTypePath } from 'editor/constants';
import { type EChartsRelationsFieldConfig } from 'editor/types';
import { makeLazyPanel } from 'lib/components/LazyPanel';
import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { STANDARD_COLOR_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { addRelationsChordOptions } from 'lib/grafana/editor/relations/chord';
import { addRelationsCustomConfig } from 'lib/grafana/editor/relations/fieldConfig';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsNodeOptions } from 'lib/grafana/editor/relations/nodes';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { addRelationsStatOptions } from 'lib/grafana/editor/relations/stats';
import { setDataTransformations } from 'lib/grafana/panelDataTransformations';
import { type PanelOptions } from 'types';
import { relationsDataTransformations } from './dataTransformations';
import { relationsSuggestionsSupplier } from './suggestions';

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
// lib/echarts/converters/graphWide.ts. Grafana's row-based node-graph frames are
// converted to the contract above the panel, by the transformation registered below.
const relationsPlugin = new PanelPlugin<PanelOptions, EChartsRelationsFieldConfig>(makeLazyPanel('relations'))
  .useFieldConfig({
    standardOptions: STANDARD_COLOR_OPTIONS,
    // Per-mark style, addressable by an ordinary field override because a mark is a
    // field: node radius, subtitle and pinned position; edge width, line type and
    // curveness; and the real "Hide in area" switches. See `addRelationsCustomConfig`.
    useCustomConfig: addRelationsCustomConfig,
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

    // How each mark reduces its own values to a main and a secondary stat. On the
    // field-based contract a mark is a field, so this is the standard `reduceOptions`
    // question every value-reducing family answers — see `addRelationsStatOptions`
    // for why only the calculation picker is registered.
    addRelationsStatOptions(builder);

    // Default tier: layout and node presentation — the controls a user coming from
    // core Grafana's Node graph panel expects. Each graph-only control gates on
    // `isGraphVariant` internally.
    addRelationsLayoutOptions(builder);
    addRelationsNodeOptions(builder);

    // Sankey-only: its Default-tier layout controls get a dedicated always-visible
    // category, plus Advanced geometry/ribbon knobs. Every control gates on
    // `isSankeyVariant` internally, mirroring the funnel variant's options.
    addRelationsSankeyOptions(builder);

    // Chord-only ring geometry, all Advanced (gated on `isChordVariant` internally).
    addRelationsChordOptions(builder);

    // Advanced tier: interaction, force tuning, link styling.
    addRelationsInteractionOptions(builder);
    addRelationsForceOptions(builder);
    addRelationsLinkOptions(builder);

    // The family has no per-point fast path, so it registers the shared animation
    // switch directly rather than the cartesian `addPerformanceOptions` bundle.
    addAnimationOption(builder);

    // `singleOnly`: a relations hover is one node or one link, so "All" has nothing
    // to list. `includeLegendCalcs: false`: a legend entry is one mark, already
    // reduced to its own stat by `reduceOptions`, so there is nothing further to
    // reduce per legend row. Matches `singleTooltipOnly` on `relationsChartModule`,
    // which clamps a persisted `multi` at render time.
    addCommonLegendAndTooltip(builder, { singleTooltipOnly: true, includeLegendCalcs: false });
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
export const plugin = setDataTransformations(relationsPlugin, relationsDataTransformations);
