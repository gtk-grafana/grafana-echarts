import { TooltipDisplayMode } from '@grafana/schema';
import { getTooltipOption, tooltipTriggerForMode } from 'echarts/tooltip';

const formatValue = (value: number | null) => (value == null ? 'null' : `${value}`);

describe('tooltipTriggerForMode', () => {
  it('uses axis for multi and item for single on time series', () => {
    expect(tooltipTriggerForMode('timeseries', TooltipDisplayMode.Multi)).toBe('axis');
    expect(tooltipTriggerForMode('timeseries', TooltipDisplayMode.Single)).toBe('item');
  });

  it('always uses item for pie, radar, and heatmap', () => {
    expect(tooltipTriggerForMode('pie', TooltipDisplayMode.Multi)).toBe('item');
    expect(tooltipTriggerForMode('radar', TooltipDisplayMode.Single)).toBe('item');
    expect(tooltipTriggerForMode('heatmap', TooltipDisplayMode.Multi)).toBe('item');
  });
});

describe('getTooltipOption', () => {
  it('disables the tooltip entirely in "Hidden" mode', () => {
    expect(getTooltipOption('axis', TooltipDisplayMode.None, formatValue)).toEqual({ show: false });
    expect(getTooltipOption('item', TooltipDisplayMode.None, formatValue)).toEqual({ show: false });
  });

  it('produces a native tooltip for the given trigger with a crosshair axis pointer', () => {
    const option = getTooltipOption('axis', TooltipDisplayMode.Multi, formatValue);
    expect(option).toMatchObject({ show: true, trigger: 'axis' });
    expect(option).toHaveProperty('axisPointer.type', 'cross');
    expect(getTooltipOption('item', TooltipDisplayMode.Single, formatValue)).toMatchObject({ trigger: 'item' });
  });

  it('formats scalar values through the Grafana formatter', () => {
    const { valueFormatter } = getTooltipOption('item', TooltipDisplayMode.Single, formatValue) as {
      valueFormatter: (value: unknown) => string;
    };
    expect(valueFormatter(10)).toBe('10');
    expect(valueFormatter(null)).toBe('null');
    expect(valueFormatter('text')).toBe('null');
  });

  it('unwraps the trailing numeric from array data items before formatting', () => {
    const { valueFormatter } = getTooltipOption('axis', TooltipDisplayMode.Multi, formatValue) as {
      valueFormatter: (value: unknown) => string;
    };
    // Cartesian [time, value] tuple.
    expect(valueFormatter([1000, 42])).toBe('42');
    // Heatmap [xStart, yStart, xEnd, yEnd, value] tuple.
    expect(valueFormatter([1000, 10, 2000, 20, 7])).toBe('7');
  });
});
