import { type FieldConfigSource } from '@grafana/data';
import { changeSeriesColorConfig } from 'lib/grafana/fields/seriesConfig';
import { useCallback } from 'react';

/**
 * Persist a legend color pick as a `byName` fixed-color field-config override;
 * Grafana re-applies it to `data.series` so the chart re-renders in the color.
 */
export function useSeriesColorChange(
  fieldConfig: FieldConfigSource,
  onFieldConfigChange: (config: FieldConfigSource) => void
): (label: string, color: string) => void {
  return useCallback(
    (label: string, color: string) => {
      onFieldConfigChange(changeSeriesColorConfig(fieldConfig, label, color));
    },
    [fieldConfig, onFieldConfigChange]
  );
}
