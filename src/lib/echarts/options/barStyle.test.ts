import { buildBarStyle } from 'lib/echarts/options/barStyle';
import { type BarStyleConfig } from 'editor/types';

describe('buildBarStyle', () => {
  it('always carries the series color and omits unset keys', () => {
    const result = buildBarStyle(undefined, undefined, '#abc', false);

    expect(result).toEqual({ itemStyle: { color: '#abc' } });
  });

  it('maps panel-level per-series properties to ECharts keys', () => {
    const panel: BarStyleConfig = {
      width: 12,
      maxWidth: 20,
      minHeight: 3,
      borderWidth: 1,
      borderType: 'dashed',
      borderRadius: 4,
      opacity: 0.5,
    };

    const result = buildBarStyle(panel, undefined, '#abc', false);

    expect(result).toMatchObject({
      barWidth: 12,
      barMaxWidth: 20,
      barMinHeight: 3,
      itemStyle: { color: '#abc', borderWidth: 1, borderType: 'dashed', borderRadius: 4, opacity: 0.5 },
    });
  });

  it('lets a per-field value win over the panel default per property', () => {
    const panel: BarStyleConfig = { width: 12, borderRadius: 4, opacity: 0.5 };
    const field: BarStyleConfig = { width: 30, opacity: 1 };

    const result = buildBarStyle(panel, field, '#abc', false);

    // field wins for width/opacity, panel fills the rest.
    expect(result.barWidth).toBe(30);
    expect(result.itemStyle.opacity).toBe(1);
    expect(result.itemStyle.borderRadius).toBe(4);
  });

  it('takes gaps only from the panel config, not the field override', () => {
    const panel: BarStyleConfig = { gap: '30%', categoryGap: '20%' };
    const field: BarStyleConfig = { gap: '5%', categoryGap: '5%' };

    const result = buildBarStyle(panel, field, '#abc', false);

    expect(result.barGap).toBe('30%');
    expect(result.barCategoryGap).toBe('20%');
  });

  it('drops barGap when stacked but keeps barCategoryGap', () => {
    const panel: BarStyleConfig = { gap: '30%', categoryGap: '20%' };

    const result = buildBarStyle(panel, undefined, '#abc', true);

    expect(result.barGap).toBeUndefined();
    expect(result.barCategoryGap).toBe('20%');
  });

  it('emits background style only when showBackground is on', () => {
    const off = buildBarStyle({ backgroundColor: '#eee' }, undefined, '#abc', false);
    expect(off.showBackground).toBeUndefined();
    expect(off.backgroundStyle).toBeUndefined();

    const on = buildBarStyle({ showBackground: true, backgroundColor: '#eee' }, undefined, '#abc', false);
    expect(on.showBackground).toBe(true);
    expect(on.backgroundStyle).toEqual({ color: '#eee' });
  });
});
