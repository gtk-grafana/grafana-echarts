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

/** The relations options pane, built exactly as `modules/relations/module.tsx` builds it. */

/** See `labels.test.ts` for why `standardEditorsRegistry` has to be stubbed under jest. */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'radio', 'number', 'slider', 'text', 'color', 'unit', 'stats-picker'].map((id) => ({
    id,
    name: id,
    editor: noEditor,
  }))
);

/** `module.tsx`'s supplier order, reproduced. */
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

/** Every option path the panel registers. */
export const registeredRelationsOptions = (): string[] => {
  const paths = buildRelationsPane().map((item) => item.path);
  const collapsed = paths.map((path) =>
    path.startsWith('legend.') ? 'legend' : path.startsWith('tooltip.') ? 'tooltip' : path
  );
  // `reduceOptions.calcs` is registered by the i18n-dependent supplier this fixture skips.
  return [...new Set([...collapsed, 'reduceOptions.calcs'])];
};
