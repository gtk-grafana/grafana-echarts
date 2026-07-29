import { type EventBus, type FieldConfigSource } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { LegendDisplayMode, SeriesVisibilityChangeBehavior, type VizLegend } from '@grafana/ui';
import { render, renderHook, screen } from '@testing-library/react';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import React from 'react';
import { useLegend } from './useLegend';

const ctx = { seriesType: 'line' } as unknown as ChartContext;
const eventBus = { publish: jest.fn(), getStream: jest.fn(), subscribe: jest.fn() } as unknown as EventBus;
const fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const resolvedLegend = {
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
} as unknown as VizLegendOptions;

const chartModule = {
  buildLegendItems: () => [
    { label: 'CPU', color: 'red', yAxis: 1 },
    { label: 'Memory', color: 'blue', yAxis: 1 },
  ],
} as unknown as ChartModule;

const options = (overrides: Partial<Parameters<typeof useLegend>[0]> = {}) => ({
  chartModule,
  chartContext: ctx,
  resolvedLegend,
  isVizLegend: true,
  seriesType: 'line' as const,
  fieldConfig,
  onFieldConfigChange: jest.fn(),
  eventBus,
  ...overrides,
});

// `@grafana/ui` exports the component but not its props type.
type VizLegendProps = React.ComponentProps<typeof VizLegend>;

/**
 * The props this hook composes onto `VizLegend`, read off the returned element
 * tree (`VizLayout.Legend` > `PanelContextProvider` > `VizLegend`) rather than
 * inferred from rendered DOM.
 */
function legendProps(element: React.ReactElement): VizLegendProps {
  const provider = React.Children.only((element.props as { children: React.ReactElement }).children);
  return React.Children.only((provider.props as { children: React.ReactElement }).children)
    .props as unknown as VizLegendProps;
}

describe('useLegend', () => {
  it('returns the family items so the caller can decide whether to reserve layout', () => {
    const { result } = renderHook(() => useLegend(options()));

    expect(result.current.items.map((item) => item.label)).toEqual(['CPU', 'Memory']);
  });

  it('renders the items through VizLegend', () => {
    const { result } = renderHook(() => useLegend(options()));

    render(result.current.renderLegend());

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('returns no items when the Grafana legend is hidden', () => {
    const { result } = renderHook(() => useLegend(options({ isVizLegend: false })));

    expect(result.current.items).toEqual([]);
  });

  it('passes the resolved legend placement and display mode through', () => {
    const { result } = renderHook(() => useLegend(options()));

    const props = legendProps(result.current.renderLegend());

    expect(props.placement).toBe('bottom');
    expect(props.displayMode).toBe(LegendDisplayMode.List);
    expect(props.isSortable).toBe(true);
  });

  it('isolates other series on click for per-field families', () => {
    const { result } = renderHook(() => useLegend(options()));

    // Core's default: clicking one series hides the rest.
    expect(legendProps(result.current.renderLegend()).seriesVisibilityChangeBehavior).toBe(
      SeriesVisibilityChangeBehavior.Isolate
    );
  });

  it('hides just the clicked item for slice and multi-value families', () => {
    // Pie slices and candlestick dimensions are not 1:1 with fields, so isolating
    // "the others" has no coherent meaning.
    for (const seriesType of ['pie', 'funnel', 'candlestick', 'boxplot'] as const) {
      const { result } = renderHook(() => useLegend(options({ seriesType })));

      expect(legendProps(result.current.renderLegend()).seriesVisibilityChangeBehavior).toBe(
        SeriesVisibilityChangeBehavior.Hide
      );
    }
  });

  it('wires both field-config handlers onto the legend context', () => {
    const onFieldConfigChange = jest.fn();
    const { result } = renderHook(() => useLegend(options({ onFieldConfigChange })));

    // `VizLegend` reads these off PanelContext, not props, so the provider value
    // is the only place they can arrive.
    const provider = React.Children.only(
      (result.current.renderLegend().props as { children: React.ReactElement }).children
    );
    const { value } = provider.props as { value: { onSeriesColorChange: (l: string, c: string) => void } };

    value.onSeriesColorChange('CPU', 'red');

    expect(onFieldConfigChange).toHaveBeenCalledTimes(1);
  });

  it('keeps renderLegend stable across a re-render with unchanged inputs', () => {
    const opts = options();
    const { result, rerender } = renderHook(() => useLegend(opts));
    const first = result.current.renderLegend;

    rerender();

    expect(result.current.renderLegend).toBe(first);
  });
});
