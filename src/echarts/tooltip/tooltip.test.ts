import { TooltipDisplayMode } from '@grafana/schema';
import { getTooltipOption, grafanaTooltipModeToEChartsTrigger } from 'echarts/tooltip';

const formatValue = (value: number | null) => (value == null ? 'null' : `${value}`);

describe('grafanaTooltipModeToEChartsTrigger', () => {
  it('uses axis for multi and item for single on cartesian (time/value) axes', () => {
    expect(grafanaTooltipModeToEChartsTrigger('time', TooltipDisplayMode.Multi)).toBe('axis');
    expect(grafanaTooltipModeToEChartsTrigger('time', TooltipDisplayMode.Single)).toBe('item');
    expect(grafanaTooltipModeToEChartsTrigger('value', TooltipDisplayMode.Multi)).toBe('axis');
  });

  it('always uses item on categorical axes (pie, radar)', () => {
    expect(grafanaTooltipModeToEChartsTrigger('category', TooltipDisplayMode.Multi)).toBe('item');
    expect(grafanaTooltipModeToEChartsTrigger('category', TooltipDisplayMode.Single)).toBe('item');
  });

  it('uses no trigger when the tooltip is hidden', () => {
    expect(grafanaTooltipModeToEChartsTrigger('time', TooltipDisplayMode.None)).toBe('none');
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
