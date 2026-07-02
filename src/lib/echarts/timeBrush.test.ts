import { brushEndToTimeRange } from 'lib/echarts/timeBrush';

describe('brushEndToTimeRange', () => {
  it('maps a lineX selection to an absolute time range', () => {
    const event = { areas: [{ coordRange: [1000, 5000] }] };

    expect(brushEndToTimeRange(event)).toEqual({ from: 1000, to: 5000 });
  });

  it('normalizes a reversed (right-to-left) selection', () => {
    const event = { areas: [{ coordRange: [5000, 1000] }] };

    expect(brushEndToTimeRange(event)).toEqual({ from: 1000, to: 5000 });
  });

  it('rounds fractional pixel-derived bounds to whole milliseconds', () => {
    const event = { areas: [{ coordRange: [1000.4, 4999.6] }] };

    expect(brushEndToTimeRange(event)).toEqual({ from: 1000, to: 5000 });
  });

  it('returns null for a zero-width selection', () => {
    expect(brushEndToTimeRange({ areas: [{ coordRange: [2000, 2000] }] })).toBeNull();
  });

  it('returns null when no area is present (stray click / cleared brush)', () => {
    expect(brushEndToTimeRange({ areas: [] })).toBeNull();
    expect(brushEndToTimeRange({})).toBeNull();
    expect(brushEndToTimeRange(undefined)).toBeNull();
  });

  it('returns null for a malformed coordRange', () => {
    expect(brushEndToTimeRange({ areas: [{ coordRange: [1000] }] })).toBeNull();
    expect(brushEndToTimeRange({ areas: [{ coordRange: ['a', 'b'] }] })).toBeNull();
    expect(brushEndToTimeRange({ areas: [{}] })).toBeNull();
  });
});
