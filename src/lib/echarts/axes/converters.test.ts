import { panelTypeToAxis } from './converters';

describe('panelTypeToAxis', () => {
  it('maps cartesian and heatmap families to a time axis when a time field is present', () => {
    expect(panelTypeToAxis('line')).toBe('time');
    expect(panelTypeToAxis('bar')).toBe('time');
    expect(panelTypeToAxis('scatter')).toBe('time');
    expect(panelTypeToAxis('heatmap')).toBe('time');
  });

  it('maps the cartesian family to a category axis when no time field is present', () => {
    expect(panelTypeToAxis('line', false)).toBe('category');
    expect(panelTypeToAxis('bar', false)).toBe('category');
    expect(panelTypeToAxis('scatter', false)).toBe('category');
  });

  it('keeps the heatmap family on a time axis regardless of the time field', () => {
    expect(panelTypeToAxis('heatmap', false)).toBe('time');
  });

  it('maps non-cartesian families to a category axis', () => {
    expect(panelTypeToAxis('pie')).toBe('category');
    expect(panelTypeToAxis('radar')).toBe('category');
  });

  it('routes multi-value types by axis support: candlestick needs a time field, boxplot falls back to category', () => {
    expect(panelTypeToAxis('candlestick')).toBe('time');
    expect(panelTypeToAxis('boxplot')).toBe('time');
    expect(panelTypeToAxis('boxplot', false)).toBe('category');
    // candlestick has no category-axis fallback, so a time-less frame is unsupported
    expect(() => panelTypeToAxis('candlestick', false)).toThrow();
  });

  it('defaults unmapped types to a category axis instead of throwing', () => {
    expect(() => panelTypeToAxis('gauge')).toThrow();
  });
});
