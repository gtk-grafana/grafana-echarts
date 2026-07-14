import { createTheme, type ValueFormatter } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { getTooltipOption, grafanaTooltipModeToEChartsTrigger } from 'lib/echarts/tooltip';
import { type TooltipPositionCallback } from 'echarts/types/dist/shared';

const theme = createTheme();
// Mirrors getValueFormatter: empty values (null/undefined/NaN) render No value text.
const formatValue: ValueFormatter = (value) => ({ text: value == null || Number.isNaN(value) ? 'null' : `${value}` });
const resolveValue = () => formatValue;

function callTooltipPosition(point: [number, number], contentSize: [number, number], viewSize: [number, number]) {
  const { position } = getTooltipOption('item', TooltipDisplayMode.Single, resolveValue, theme);
  return (position as TooltipPositionCallback)(point, [], null, null, { contentSize, viewSize });
}

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
    expect(getTooltipOption('axis', TooltipDisplayMode.None, resolveValue, theme)).toEqual({ show: false });
    expect(getTooltipOption('item', TooltipDisplayMode.None, resolveValue, theme)).toEqual({ show: false });
  });

  it('produces a native tooltip for the given trigger with a crosshair axis pointer', () => {
    const option = getTooltipOption('axis', TooltipDisplayMode.Multi, resolveValue, theme);
    expect(option).toMatchObject({ show: true, trigger: 'axis' });
    expect(option).toHaveProperty('axisPointer.type', 'cross');
    expect(getTooltipOption('item', TooltipDisplayMode.Single, resolveValue, theme)).toMatchObject({ trigger: 'item' });
  });

  it('formats scalar values through the Grafana formatter', () => {
    const { valueFormatter } = getTooltipOption('item', TooltipDisplayMode.Single, resolveValue, theme) as {
      valueFormatter: (value: unknown) => string;
    };
    expect(valueFormatter(10)).toBe('10');
    // Empty values route through the field formatter's No value text (stub -> 'null').
    expect(valueFormatter(null)).toBe('null');
    expect(valueFormatter('text')).toBe('text');
  });

  it('unwraps the trailing numeric from array data items before formatting', () => {
    const { valueFormatter } = getTooltipOption('axis', TooltipDisplayMode.Multi, resolveValue, theme) as {
      valueFormatter: (value: unknown) => string;
    };
    // Cartesian [time, value] tuple.
    expect(valueFormatter([1000, 42])).toBe('42');
    // Heatmap [xStart, yStart, xEnd, yEnd, value] tuple.
    expect(valueFormatter([1000, 10, 2000, 20, 7])).toBe('7');
  });

  it('positions the tooltip beside the cursor with a gap', () => {
    expect(callTooltipPosition([50, 50], [80, 40], [400, 300])).toEqual({ left: 60, top: 60 });
  });

  it('flips the tooltip when it would overflow the chart view', () => {
    expect(callTooltipPosition([350, 250], [80, 40], [400, 300])).toEqual({ left: 260, top: 260 });
  });

  it('clamps the tooltip inside the chart view after flipping', () => {
    expect(callTooltipPosition([50, 50], [100, 50], [120, 80])).toEqual({ left: 0, top: 0 });
  });
});
