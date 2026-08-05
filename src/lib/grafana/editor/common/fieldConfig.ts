import { FieldColorModeId, FieldConfigProperty, type StandardOptionConfig } from '@grafana/data';

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
