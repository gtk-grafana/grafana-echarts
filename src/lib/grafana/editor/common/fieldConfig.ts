import {
  type FieldConfigEditorBuilder,
  FieldColorModeId,
  FieldConfigProperty,
  type StandardOptionConfig,
} from '@grafana/data';
import { type HideSeriesConfig } from '@grafana/schema';

/**
 * The standard Color field-config option shared by every nested panel family.
 * All five modules customize only Color the same way — classic palette default,
 * with by-value and by-series color supported and thresholds mode not preferred
 * — so the block lives here once and is spread into each module's
 * `standardOptions` under `FieldConfigProperty.Color` (see `STANDARD_COLOR_OPTIONS`).
 */
export const STANDARD_COLOR_OPTION: StandardOptionConfig = {
  settings: {
    byValueSupport: true,
    bySeriesSupport: true,
    preferThresholdsMode: false,
  },
  defaultValue: {
    mode: FieldColorModeId.PaletteClassic,
  },
};

/**
 * The `standardOptions` object every family passes to `useFieldConfig`: the
 * shared Color option keyed by `FieldConfigProperty.Color`. Spread (or passed
 * directly) so a module reads `standardOptions: STANDARD_COLOR_OPTIONS`.
 */
export const STANDARD_COLOR_OPTIONS = {
  [FieldConfigProperty.Color]: STANDARD_COLOR_OPTION,
};

/** Registered but never rendered — see `addHiddenSeriesHideFrom`. */
const NoEditor = (): null => null;

/**
 * Register `custom.hideFrom` **without** exposing any editor for it.
 *
 * Row-based families (relations nodes today) need the property *registered*
 * because Grafana drops override properties no plugin declared — without it the
 * legend visibility toggle writes a `hideSeriesFrom` override that is silently
 * discarded. But they must not offer the control in the override UI, because a
 * `byName` override can only name a real **field**, and applying `hideFrom` to
 * `mainstat` or `source` does nothing in a family whose marks are frame rows.
 * Offering it would be a control that reads as working and never does.
 *
 * `commonOptionsBuilder.addHideFrom` already sets `hideFromDefaults`; this adds
 * `hideFromOverrides` too, so the property exists purely as a persistence slot
 * for the legend toggle and both editors are unreachable (hence `NoEditor`).
 *
 * Per-field families must keep using `commonOptionsBuilder.addHideFrom`: there
 * the override genuinely targets a series.
 * https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/custom-panel-option-editors
 */
export function addHiddenSeriesHideFrom<T>(builder: FieldConfigEditorBuilder<T>): void {
  builder.addCustomEditor<unknown, HideSeriesConfig>({
    id: 'hideFrom',
    name: 'Hide in area',
    category: ['Series'],
    path: 'hideFrom',
    defaultValue: { viz: false, legend: false, tooltip: false },
    editor: NoEditor,
    override: NoEditor,
    hideFromDefaults: true,
    hideFromOverrides: true,
    shouldApply: () => true,
    // Narrowed rather than passed through: `process` receives `any`, and the only
    // writer is the legend toggle (`toggleSeriesVisibilityConfig`), so anything
    // that is not a `HideSeriesConfig` is dropped instead of trusted.
    process: (value: unknown) =>
      typeof value === 'object' && value !== null && 'viz' in value
        ? {
            viz: value.viz === true,
            legend: 'legend' in value && value.legend === true,
            tooltip: 'tooltip' in value && value.tooltip === true,
          }
        : undefined,
  });
}
