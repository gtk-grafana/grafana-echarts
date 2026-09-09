import { type FieldConfigSource } from '@grafana/data';
import { type SeriesVisibilityChangeMode, type VizLegendItem } from '@grafana/ui';
import { toggleSeriesVisibilityConfig } from 'lib/grafana/fields/seriesConfig';
import { useCallback } from 'react';

// `PanelProps` types `onFieldConfigChange` with a single argument, but the
// runtime implementation (scenes `VizPanel.onFieldConfigChange`) takes a second
// `replace` flag. Without `replace: true` the update is lodash-deep-merged into
// the current config, and merging cannot remove or shrink `overrides` (empty or
// shorter arrays contribute nothing), so visibility un-toggles would never land.
// Core passes `true` for its own legend visibility toggles; we mirror that.
// https://github.com/grafana/scenes/blob/main/packages/scenes/src/components/VizPanel/VizPanel.tsx
type FieldConfigChangeHandler = (config: FieldConfigSource, replace?: boolean) => void;

/**
 * Persist a legend visibility toggle as `byName` `hideFrom` overrides. The
 * isolate/append semantics need the full set of series names, which is why this
 * takes the built items rather than deriving names itself.
 *
 * `overrideTargetNames` widens that set for a family whose fields outnumber its
 * legend rows. The override is an *exclude* matcher — "hide everything except these"
 * — so a name missing from it is a field Grafana will hide, whether or not the
 * legend ever mentioned it. Relations supplies its edges this way; see
 * `ChartModule.getOverrideTargetNames`.
 */
export function useSeriesVisibility(
  fieldConfig: FieldConfigSource,
  onFieldConfigChange: (config: FieldConfigSource) => void,
  legendItems: VizLegendItem[],
  overrideTargetNames?: string[]
): (label: string | string[] | null, mode: SeriesVisibilityChangeMode) => void {
  return useCallback(
    (label: string | string[] | null, mode: SeriesVisibilityChangeMode) => {
      const seriesNames = overrideTargetNames ?? legendItems.map((item) => item.fieldName ?? item.label);

      // Must replace (not merge) the field config so override removals take
      // effect; see `FieldConfigChangeHandler`.
      // @todo Remove after https://github.com/grafana/grafana/compare/gtk-grafana/onFieldConfigChange/broken-types?expand=1 is merged and grafana/data is updated
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      (onFieldConfigChange as FieldConfigChangeHandler)(
        toggleSeriesVisibilityConfig(fieldConfig, label, mode, seriesNames),
        true
      );
    },
    [fieldConfig, onFieldConfigChange, legendItems, overrideTargetNames]
  );
}
