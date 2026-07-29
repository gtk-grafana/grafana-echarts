import { renderHook } from '@testing-library/react';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { DISABLE_TIME_BRUSH_ACTION, ENABLE_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { NOOP_TOOLTIP_SINK } from 'lib/echarts/tooltip/model';
import { useChartOption } from './useChartOption';

// The option build is covered end-to-end by `panelOption.test.ts`; mocking it
// here lets these tests drive the branches this hook owns — the brush arm/clear
// choice, and the throw on a family that produces no option.
jest.mock('lib/echarts/options/panelOption', () => ({ buildPanelChartOption: jest.fn() }));
const buildOption = jest.mocked(buildPanelChartOption);

interface SetOptionCall {
  option: ECBasicOption;
  opts?: { notMerge?: boolean };
}

function createFakeChart() {
  const setOptionCalls: SetOptionCall[] = [];
  const dispatched: unknown[] = [];
  return {
    chart: {
      setOption: (option: ECBasicOption, opts?: { notMerge?: boolean }) => void setOptionCalls.push({ option, opts }),
      dispatchAction: (payload: unknown) => void dispatched.push(payload),
    } as unknown as EChartsType,
    setOptionCalls,
    dispatched,
  };
}

const ctx = { seriesType: 'line' } as unknown as ChartContext;
const options = { isGrafanaLegend: false, tooltipSink: NOOP_TOOLTIP_SINK, reportTooltipTrigger: () => undefined };

describe('useChartOption', () => {
  beforeEach(() => {
    buildOption.mockReset();
  });

  it('replaces the option outright rather than merging into the previous one', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart, setOptionCalls } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    // A merge would leave behind components the new family omits.
    expect(setOptionCalls).toEqual([{ option: { series: [] }, opts: { notMerge: true } }]);
  });

  it('reports the resolved tooltip trigger so the overlay knows how to hide', () => {
    buildOption.mockReturnValue({ tooltip: { trigger: 'axis' } });
    const { chart } = createFakeChart();
    const reportTooltipTrigger = jest.fn();

    renderHook(() => useChartOption(chart, ctx, { ...options, reportTooltipTrigger }));

    expect(reportTooltipTrigger).toHaveBeenCalledWith('axis');
  });

  it('arms the time-brush cursor when the option carries a brush', () => {
    buildOption.mockReturnValue({ brush: {} });
    const { chart, dispatched } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    // `notMerge` recreates the brush component, so the cursor is re-armed here.
    expect(dispatched).toEqual([ENABLE_TIME_BRUSH_ACTION]);
  });

  it('clears the brush cursor for a family with no time axis', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart, dispatched } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    expect(dispatched).toEqual([DISABLE_TIME_BRUSH_ACTION]);
  });

  it('throws when the chart family produces no option', () => {
    buildOption.mockReturnValue(null as unknown as ECBasicOption);
    const { chart } = createFakeChart();

    expect(() => renderHook(() => useChartOption(chart, ctx, options))).toThrow('No echart option!');
  });

  it('does not build before the instance exists', () => {
    renderHook(() => useChartOption(null, ctx, options));

    expect(buildOption).not.toHaveBeenCalled();
  });

  it('rebuilds when the chart context changes, but not on an unrelated re-render', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(({ context }) => useChartOption(chart, context, options), {
      initialProps: { context: ctx },
    });

    rerender({ context: ctx });
    expect(buildOption).toHaveBeenCalledTimes(1);

    // `chartContext` is memoized upstream, so a new identity means real change.
    rerender({ context: { ...ctx } as ChartContext });
    expect(buildOption).toHaveBeenCalledTimes(2);
  });
});
