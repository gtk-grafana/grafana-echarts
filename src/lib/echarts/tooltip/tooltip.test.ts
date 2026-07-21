import { TooltipDisplayMode } from '@grafana/schema';
import { getSilentTooltipOption, grafanaTooltipModeToEChartsTrigger } from 'lib/echarts/tooltip';
import { type TooltipModel } from 'lib/echarts/tooltip/model';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

const asParams = (params: unknown) => params as TopLevelFormatterParams;
const produce = (): TooltipModel => ({ header: { label: '', value: 'h' }, rows: [{ label: 'a', value: '1' }] });
const noop = () => undefined;

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

describe('getSilentTooltipOption', () => {
  it('disables the tooltip entirely in "Hidden" mode', () => {
    expect(getSilentTooltipOption('axis', TooltipDisplayMode.None, produce, noop)).toEqual({ show: false });
    expect(getSilentTooltipOption('item', TooltipDisplayMode.None, produce, noop)).toEqual({ show: false });
  });

  it('produces a visually silent tooltip for the given trigger with a crosshair axis pointer', () => {
    const option = getSilentTooltipOption('axis', TooltipDisplayMode.Multi, produce, noop);
    // Active (so ECharts still does hit-testing/aggregation) but chrome is neutralized.
    expect(option).toMatchObject({
      show: true,
      trigger: 'axis',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 0,
    });
    expect(option).toHaveProperty('axisPointer.type', 'cross');
    expect(getSilentTooltipOption('item', TooltipDisplayMode.Single, produce, noop)).toMatchObject({ trigger: 'item' });
  });

  it('formatter emits the produced model to the sink and renders nothing natively', () => {
    const emitted: TooltipModel[] = [];
    const option = getSilentTooltipOption('item', TooltipDisplayMode.Single, produce, (model) => emitted.push(model));

    const rendered = (option.formatter as (params: TopLevelFormatterParams) => string)(asParams({ dataIndex: 0 }));

    expect(rendered).toBe('');
    expect(emitted).toEqual([{ header: { label: '', value: 'h' }, rows: [{ label: 'a', value: '1' }] }]);
  });
});
