import {
  type FieldColorConfigSettings,
  FieldColorModeId,
  FieldConfigProperty,
  type StandardOptionConfig,
} from '@grafana/data';

/**
 * The standard Color field-config option shared by the panel families whose mark **is**
 * a series: classic palette default, by-value and by-series colour supported, thresholds
 * mode not preferred. The block lives here once and is spread into each module's
 * `standardOptions` under `FieldConfigProperty.Color` (see `STANDARD_FIELD_OPTIONS`).
 *
 * Relations is the exception and takes `RELATIONS_FIELD_OPTIONS` instead
 * (`lib/grafana/editor/relations/standardOptions.ts`), which spreads these settings
 * with one key changed — hence the export.
 */
export const STANDARD_COLOR_SETTINGS: FieldColorConfigSettings = {
  byValueSupport: true,
  bySeriesSupport: true,
  preferThresholdsMode: false,
};

export const STANDARD_COLOR_OPTION: StandardOptionConfig = {
  settings: STANDARD_COLOR_SETTINGS,
  defaultValue: {
    mode: FieldColorModeId.PaletteClassic,
  },
};

/**
 * The standard **Filterable** option, un-hidden from the Fields tab's defaults.
 *
 * `filterable` is the flag core's own tooltips and table cells gate their ad-hoc filter
 * buttons on (`DefaultCell`, and `resolveFilters` in `lib/components/tooltip`), and this
 * plugin's tooltip footer does the same — a "Filter for" button that writes a key the
 * datasource does not carry either does nothing or empties the dashboard, so it is offered
 * only where a field says filtering is possible.
 *
 * Core registers the property `hideFromDefaults: true`, i.e. override-only, because the
 * usual author is a **datasource** describing its own fields. That leaves a user whose
 * datasource says nothing having to write one override per field to get any filters at all
 * — and on the relations family a field is a single node or a single edge, so "one override
 * per field" means one per mark. Un-hiding it puts the same switch in the Fields tab, where
 * "every field in this panel is filterable" is one click; a per-field override still wins
 * over it, so nothing is lost.
 *
 * No `defaultValue`: unset stays unset, and no tooltip offers a filter until someone says
 * so.
 */
export const STANDARD_FILTERABLE_OPTION: StandardOptionConfig = {
  hideFromDefaults: false,
};

/**
 * The `standardOptions` object every family passes to `useFieldConfig`: the
 * shared Color option keyed by `FieldConfigProperty.Color`, plus the Filterable
 * switch. Spread (or passed directly) so a module reads
 * `standardOptions: STANDARD_FIELD_OPTIONS`.
 */
export const STANDARD_FIELD_OPTIONS = {
  [FieldConfigProperty.Color]: STANDARD_COLOR_OPTION,
  [FieldConfigProperty.Filterable]: STANDARD_FILTERABLE_OPTION,
};
