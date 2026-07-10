import {
  type DataFrame,
  type PanelOptionsEditorBuilder,
  standardEditorsRegistry,
  type StatsPickerConfigSettings,
} from '@grafana/data';
import { LegendDisplayMode } from '@grafana/schema';
import { frameHasCartesianOverride } from 'editor/series';
import { type PanelOptions } from 'types';

const legendCategory = ['Legend'];

/** Whether any frame carries a cartesian overlay override (see frameHasCartesianOverride). */
const hasCartesianOverlay = (data?: DataFrame[]): boolean => !!data?.some(frameHasCartesianOverride);

/**
 * Grafana DOM legend options for the heatmap panel, gated to only appear when a
 * cartesian overlay exists. The heatmap cells are represented by the ECharts
 * visualMap (see the "Heatmap legend" category), so the DOM legend — which lists
 * only overlay series — is irrelevant without an overlay.
 *
 * Mirrors the subset of `commonOptionsBuilder.addLegendOptions` that
 * `resolveLegendOptions` consumes (visibility, mode, placement, values); the
 * rarely-used width/overflow/limit are trimmed to keep the surface small.
 */
export function addOverlayLegendOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder
    .addBooleanSwitch({
      path: 'legend.showLegend',
      name: 'Visibility',
      category: legendCategory,
      defaultValue: true,
      showIf: (_opts, data) => hasCartesianOverlay(data),
    })
    .addRadio({
      path: 'legend.displayMode',
      name: 'Mode',
      category: legendCategory,
      defaultValue: LegendDisplayMode.List,
      settings: {
        options: [
          { value: LegendDisplayMode.List, label: 'List' },
          { value: LegendDisplayMode.Table, label: 'Table' },
        ],
      },
      showIf: (opts, data) => hasCartesianOverlay(data) && opts.legend.showLegend,
    })
    .addRadio({
      path: 'legend.placement',
      name: 'Placement',
      category: legendCategory,
      defaultValue: 'bottom',
      settings: {
        options: [
          { value: 'bottom', label: 'Bottom' },
          { value: 'right', label: 'Right' },
        ],
      },
      showIf: (opts, data) => hasCartesianOverlay(data) && opts.legend.showLegend,
    })
    .addCustomEditor<StatsPickerConfigSettings, string[]>({
      id: 'legend.calcs',
      path: 'legend.calcs',
      name: 'Values',
      category: legendCategory,
      description: 'Select values or calculations to show in legend',
      editor: standardEditorsRegistry.get('stats-picker').editor,
      defaultValue: [],
      settings: { allowMultiple: true },
      showIf: (opts, data) => hasCartesianOverlay(data) && opts.legend.showLegend !== false,
    });
}
