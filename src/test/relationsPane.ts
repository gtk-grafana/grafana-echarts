import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';

import { seriesTypePath } from 'editor/constants';
import {
  relationsCategoryName,
  relationsLayoutCategoryName,
  relationsSeriesTypeOptions,
} from 'editor/relations/constants';
import { isGraphVariant } from 'editor/relations/variants';
import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { removeOption } from 'lib/grafana/editor/common/removeOption';
import { addRelationsChordOptions } from 'lib/grafana/editor/relations/chord';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLabelOptions } from 'lib/grafana/editor/relations/labels';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { addRelationsTimelineOptions } from 'lib/grafana/editor/relations/timeline';
import { type PanelOptions } from 'types';

/**
 * The relations options pane, built exactly as `modules/relations/module.tsx` builds it.
 *
 * A shared fixture rather than a private helper because **two** suites need the live
 * registry and they must not drift apart: `optionSurface.test.ts` asserts the pane's shape
 * (which sections exist, in what order, holding what), and `allOptionsDashboard.test.ts`
 * asserts the reference dashboard and the parity doc cover every option in it. If each
 * reconstructed the pane itself, the second could pass against a stale copy of the first.
 *
 * Kept in `src/test/` beside the other fixtures, so neither suite imports from the other —
 * importing across `*.test.ts` files would also break the one-kind-of-test-per-file rule.
 */

/** See `labels.test.ts` for why `standardEditorsRegistry` has to be stubbed under jest. */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'radio', 'number', 'slider', 'text', 'color', 'unit', 'stats-picker'].map((id) => ({
    id,
    name: id,
    editor: noEditor,
  }))
);

/**
 * `module.tsx`'s supplier order, reproduced.
 *
 * `addRelationsStatOptions` is the one omission: it calls `t()` at registration time, which
 * needs an initialised i18n the panel module sets up and a unit test has no reason to. Its
 * one option (`reduceOptions.calcs`) is therefore added by hand below, so the registry this
 * returns is still complete — callers assert against the *whole* option set.
 */
export const buildRelationsPane = () => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();

  if (relationsSeriesTypeOptions.length > 1) {
    builder.addRadio({
      path: seriesTypePath,
      name: 'Chart type',
      category: [relationsCategoryName],
      defaultValue: 'graph',
      settings: { options: relationsSeriesTypeOptions },
    });
  }
  addRelationsTimelineOptions(builder);
  addRelationsLabelOptions(builder);
  addRelationsLayoutOptions(builder);
  addRelationsForceOptions(builder);
  addAnimationOption(builder, { category: [relationsLayoutCategoryName], showIf: (o) => !isGraphVariant(o) });
  addRelationsInteractionOptions(builder);
  addRelationsLinkOptions(builder);
  addRelationsSankeyOptions(builder);
  addRelationsChordOptions(builder);
  addCommonLegendAndTooltip(builder, { singleTooltipOnly: true, includeLegendCalcs: false });
  removeOption(builder, 'tooltip.sort');
  removeOption(builder, 'tooltip.hideZeros');
  addEditorModeOption(builder, [relationsCategoryName]);

  return builder.getItems();
};

/**
 * Every option path the panel registers, collapsed to the key a dashboard or a reset is
 * written against: `legend.*` and `tooltip.*` are one Grafana block each and are demoed
 * and excused as `legend` / `tooltip`, while `animation.enabled` keeps its full path
 * because that is the key the editor registers and the reset names.
 */
export const registeredRelationsOptions = (): string[] => {
  const paths = buildRelationsPane().map((item) => item.path);
  const collapsed = paths.map((path) =>
    path.startsWith('legend.') ? 'legend' : path.startsWith('tooltip.') ? 'tooltip' : path
  );
  // `reduceOptions.calcs` is registered by the i18n-dependent supplier this fixture skips.
  return [...new Set([...collapsed, 'reduceOptions.calcs'])];
};
