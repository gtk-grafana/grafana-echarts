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

  describe('category axis (candlestick/boxplot)', () => {
    // coordRange is in category-index units, so ISO-timestamp labels are needed
    // to translate the selection back into epoch ms.
    const categories = [
      '2021-07-13T17:00:00.000Z', // index 0
      '2021-07-13T17:13:07.798Z', // index 1
      '2021-07-13T17:20:00.000Z', // index 2
      '2021-07-13T17:26:25.145Z', // index 3
      '2021-07-13T17:30:00.000Z', // index 4
    ];
    const xAxis = { type: 'category', data: categories };

    it('maps brushed category indices to the bounding timestamps', () => {
      const event = { areas: [{ coordRange: [1, 3] }] } as BrushModel;

      expect(brushEndToTimeRange(event, xAxis)).toEqual({
        from: Date.parse('2021-07-13T17:13:07.798Z'),
        to: Date.parse('2021-07-13T17:26:25.145Z'),
      });
    });

    it('rounds fractional indices to the nearest category', () => {
      const event = { areas: [{ coordRange: [0.9, 3.1] }] } as BrushModel;

      expect(brushEndToTimeRange(event, xAxis)).toEqual({
        from: Date.parse('2021-07-13T17:13:07.798Z'),
        to: Date.parse('2021-07-13T17:26:25.145Z'),
      });
    });

    it('normalizes a reversed selection', () => {
      const event = { areas: [{ coordRange: [3, 1] }] } as BrushModel;

      expect(brushEndToTimeRange(event, xAxis)).toEqual({
        from: Date.parse('2021-07-13T17:13:07.798Z'),
        to: Date.parse('2021-07-13T17:26:25.145Z'),
      });
    });

    it('clamps indices beyond the category bounds to the available data', () => {
      const event = { areas: [{ coordRange: [-5, 99] }] } as BrushModel;

      expect(brushEndToTimeRange(event, xAxis)).toEqual({
        from: Date.parse(categories[0]),
        to: Date.parse(categories[categories.length - 1]),
      });
    });

    it('returns null when the selection collapses to a single category', () => {
      expect(brushEndToTimeRange({ areas: [{ coordRange: [2, 2] }] } as BrushModel, xAxis)).toBeNull();
    });

    it('returns null when the axis has no category labels', () => {
      expect(brushEndToTimeRange({ areas: [{ coordRange: [1, 3] }] } as BrushModel, { type: 'category' })).toBeNull();
      expect(
        brushEndToTimeRange({ areas: [{ coordRange: [1, 3] }] } as BrushModel, { type: 'category', data: [] })
      ).toBeNull();
    });

    it('returns null when category labels are not parseable timestamps', () => {
      const event = { areas: [{ coordRange: [0, 1] }] } as BrushModel;

      expect(brushEndToTimeRange(event, { type: 'category', data: ['alpha', 'beta'] })).toBeNull();
    });
  });
});
