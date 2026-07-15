import { type FieldConfigSource, type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import {
  PanelContextProvider,
  type SeriesVisibilityChangeMode,
  SeriesVisibilityChangeBehavior,
  usePanelContext,
  useTheme2,
  VizLayout,
  VizLegend,
} from '@grafana/ui';
import { seriesTypePath } from 'editor/constants';
import { isMultiValueSeriesType } from 'lib/echarts/charts/narrowing';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { changeSeriesColorConfig, toggleSeriesVisibilityConfig } from 'lib/grafana/fields/seriesConfig';
import { getRepresentativeFormatter } from 'lib/grafana/formatter';
import React, { useCallback, useMemo } from 'react';
import { type PanelOptions } from 'types';
import { EChart } from './EChart';

interface Props extends PanelProps<PanelOptions> {}

// `PanelProps` types `onFieldConfigChange` with a single argument, but the
// runtime implementation (scenes `VizPanel.onFieldConfigChange`) takes a second
// `replace` flag. Without `replace: true` the update is lodash-deep-merged into
// the current config, and merging cannot remove or shrink `overrides` (empty or
// shorter arrays contribute nothing), so visibility un-toggles would never land.
// Core passes `true` for its own legend visibility toggles; we mirror that.
// https://github.com/grafana/scenes/blob/main/packages/scenes/src/components/VizPanel/VizPanel.tsx
type FieldConfigChangeHandler = (config: FieldConfigSource, replace?: boolean) => void;

export const Panel: React.FC<Props> = ({
  options,
  data,
  width,
  height,
  fieldConfig,
  id,
  timeZone,
  eventBus,
  timeRange,
  onChangeTimeRange,
  onFieldConfigChange,
}) => {
  const theme = useTheme2();
  const panelContext = usePanelContext();
  const seriesType = options[seriesTypePath];

  const chartModule = useMemo(() => resolveChartModule(seriesType), [seriesType]);

  const resolvedLegend = useMemo(() => resolveLegendOptions(chartModule, options), [chartModule, options]);

  const isVizLegend = isLegendVisible(resolvedLegend);

  const formatValue = useMemo(
    () => getRepresentativeFormatter(data.series, theme, timeZone),
    [data.series, theme, timeZone]
  );

  const chartContext: ChartContext = useMemo(
    () => ({
      frames: data.series,
      theme,
      timeZone,
      timeRange,
      options,
      seriesType,
      formatValue,
      fieldConfig,
    }),
    [data.series, theme, timeZone, timeRange, options, seriesType, formatValue, fieldConfig]
  );

  const legendItems = useMemo(() => {
    if (!isVizLegend) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, resolvedLegend.calcs ?? []);
  }, [isVizLegend, chartModule, chartContext, resolvedLegend]);

  // Persist a legend color pick as a `byName` fixed-color field-config override;
  // Grafana re-applies it to `data.series` so the chart re-renders in the color.
  const onSeriesColorChange = useCallback(
    (label: string, color: string) => {
      onFieldConfigChange(changeSeriesColorConfig(fieldConfig, label, color));
    },
    [fieldConfig, onFieldConfigChange]
  );

  // Persist a legend visibility toggle as `byName` `hideFrom` overrides. The
  // isolate/append semantics need the full set of legend series names. Must
  // replace (not merge) the field config so override removals take effect; see
  // `FieldConfigChangeHandler`.
  const onToggleSeriesVisibility = useCallback(
    (label: string | string[] | null, mode: SeriesVisibilityChangeMode) => {
      const seriesNames = legendItems.map((item) => item.fieldName ?? item.label);

      // @todo Remove after https://github.com/grafana/grafana/compare/gtk-grafana/onFieldConfigChange/broken-types?expand=1 is merged and grafana/data is updated
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      (onFieldConfigChange as FieldConfigChangeHandler)(
        toggleSeriesVisibilityConfig(fieldConfig, label, mode, seriesNames),
        true
      );
    },
    [fieldConfig, onFieldConfigChange, legendItems]
  );

  const legendContextValue = useMemo(
    () => ({
      ...panelContext,
      eventBus,
      onSeriesColorChange,
      onToggleSeriesVisibility,
    }),
    [panelContext, eventBus, onSeriesColorChange, onToggleSeriesVisibility]
  );

  // Pie slices and candlestick/boxplot series map to legend items individually
  // (not 1:1 with fields), so each click toggles that one item (Hide behavior)
  // rather than the isolate-others default used by per-field families.
  const seriesVisibilityChangeBehavior =
    seriesType === 'pie' || isMultiValueSeriesType(seriesType)
      ? SeriesVisibilityChangeBehavior.Hide
      : SeriesVisibilityChangeBehavior.Isolate;

  const renderLegend = useCallback(
    () => (
      <VizLayout.Legend placement={resolvedLegend.placement} width={resolvedLegend.width}>
        <PanelContextProvider value={legendContextValue}>
          <VizLegend
            items={legendItems}
            displayMode={resolvedLegend.displayMode}
            placement={resolvedLegend.placement}
            seriesVisibilityChangeBehavior={seriesVisibilityChangeBehavior}
            sortBy={resolvedLegend.sortBy}
            sortDesc={resolvedLegend.sortDesc}
            isSortable={true}
            limit={resolvedLegend.limit}
          />
        </PanelContextProvider>
      </VizLayout.Legend>
    ),
    [legendContextValue, legendItems, resolvedLegend, seriesVisibilityChangeBehavior]
  );

  if (data.series.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <VizLayout width={width} height={height} legend={legendItems.length > 0 ? renderLegend() : null}>
      {(vizWidth: number, vizHeight: number) => (
        <EChart
          chartContext={chartContext}
          chartModule={chartModule}
          isGrafanaLegend={isVizLegend}
          onChangeTimeRange={onChangeTimeRange}
          width={vizWidth}
          height={vizHeight}
        />
      )}
    </VizLayout>
  );
};
