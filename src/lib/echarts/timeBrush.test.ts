import type BrushModel from 'echarts/types/src/component/brush/BrushModel';
import { brushEndToTimeRange } from 'lib/echarts/timeBrush';

describe('brushEndToTimeRange', () => {
  it('maps a lineX selection to an absolute time range', () => {
    const event = { areas: [{ coordRange: [1000, 5000] }] } as BrushModel;

    expect(brushEndToTimeRange(event)).toEqual({ from: 1000, to: 5000 });
  });

  it('normalizes a reversed (right-to-left) selection', () => {
    const event = { areas: [{ coordRange: [5000, 1000] }] } as BrushModel;

    expect(brushEndToTimeRange(event)).toEqual({ from: 1000, to: 5000 });
  });

  it('rounds fractional pixel-derived bounds to whole milliseconds', () => {
    const event = { areas: [{ coordRange: [1000.4, 4999.6] }] } as BrushModel;

    expect(brushEndToTimeRange(event)).toEqual({ from: 1000, to: 5000 });
  });

  it('returns null for a zero-width selection', () => {
    expect(brushEndToTimeRange({ areas: [{ coordRange: [2000, 2000] }] } as BrushModel)).toBeNull();
  });

  it('returns null when no area is present (stray click / cleared brush)', () => {
    expect(brushEndToTimeRange({ areas: [] } as unknown as BrushModel)).toBeNull();
    expect(brushEndToTimeRange({} as unknown as BrushModel)).toBeNull();
    expect(brushEndToTimeRange(undefined as unknown as BrushModel)).toBeNull();
  });

  it('returns null for a malformed coordRange', () => {
    expect(brushEndToTimeRange({ areas: [{ coordRange: [1000] }] } as BrushModel)).toBeNull();
    expect(brushEndToTimeRange({ areas: [{ coordRange: ['a', 'b'] }] } as unknown as BrushModel)).toBeNull();
    expect(brushEndToTimeRange({ areas: [{}] } as BrushModel)).toBeNull();
  });
});
