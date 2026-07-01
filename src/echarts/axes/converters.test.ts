import { panelTypeToAxis } from './converters';

describe('panelTypeToAxis', () => {
  it('maps cartesian and heatmap families to a time axis', () => {
    expect(panelTypeToAxis('line')).toBe('time');
    expect(panelTypeToAxis('bar')).toBe('time');
    expect(panelTypeToAxis('scatter')).toBe('time');
    expect(panelTypeToAxis('heatmap')).toBe('time');
  });

  it('maps non-cartesian families to a category axis', () => {
    expect(panelTypeToAxis('pie')).toBe('category');
    expect(panelTypeToAxis('radar')).toBe('category');
  });

  it('defaults unmapped types to a category axis instead of throwing', () => {
    expect(panelTypeToAxis('gauge')).toBe('category');
  });
});
