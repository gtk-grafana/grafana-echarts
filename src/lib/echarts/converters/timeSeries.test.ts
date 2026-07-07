import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import { type SeriesType } from 'editor/types';

const theme = createTheme();

const wideFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3] },
      { name: 'cpu', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'cpu' } },
      { name: 'mem', type: FieldType.number, values: [40, 50, 60], config: { displayName: 'mem' } },
    ],
  });

const multiFrame = (name: string, times: number[], values: Array<number | null>): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: times },
      { name: 'value', type: FieldType.number, values, config: { displayName: name } },
    ],
  });

describe('timeSeriesToEChartsOption', () => {
  describe('Wide format (one frame, shared time field, many value fields)', () => {
    it('returns one series per numeric field sharing the time field', () => {
      const result = timeSeriesToEChartsOption([wideFrame()], 'line', theme);

      expect(result).toHaveLength(2);
      expect(result![0]).toMatchObject({
        name: 'cpu',
        type: 'line',
        data: [
          [1, 10],
          [2, 20],
          [3, 30],
        ],
      });
      expect(result![1]).toMatchObject({
        name: 'mem',
        type: 'line',
        data: [
          [1, 40],
          [2, 50],
          [3, 60],
        ],
      });
    });

    it('resolves a color for each series, shared between symbol and line', () => {
      const result = timeSeriesToEChartsOption([wideFrame()], 'line', theme);

      const series = result![0] as LineSeriesOption;
      expect(series.itemStyle?.color).toEqual('#808080');
    });
  });

  describe('Multi format (many frames, each with its own time field)', () => {
    it('returns one series per frame, preserving each frame non-aligned timestamps', () => {
      const frames = [
        multiFrame('a', [1, 2, 3], [10, 20, 30]),
        multiFrame('b', [5, 6, 9], [60, 80, 90]),
      ];

      const result = timeSeriesToEChartsOption(frames, 'line', theme);

      expect(result).toHaveLength(2);

      expect(result![0].name).toBe('a');
      expect(result![0].data).toEqual([
        [1, 10],
        [2, 20],
        [3, 30],
      ]);

      // Second series keeps its own distinct, non-aligned timestamps.
      expect(result![1].name).toBe('b');
      expect(result![1].data).toEqual([
        [5, 60],
        [6, 80],
        [9, 90],
      ]);
    });
  });

  describe('value coercion', () => {
    it('coerces null/undefined values to null but preserves zero', () => {
      const frame = multiFrame('a', [1, 2, 3, 4], [0, null, 30, undefined as unknown as number]);

      const result = timeSeriesToEChartsOption([frame], 'line', theme);

      expect(result![0].data).toEqual([
        [1, 0],
        [2, null],
        [3, 30],
        [4, null],
      ]);
    });
  });

  describe('series type', () => {
    it.each(['line', 'bar', 'scatter', 'effectScatter'] as SeriesType[])(
      'propagates the requested series type "%s" to every series',
      (seriesType) => {
        const result = timeSeriesToEChartsOption([wideFrame()], seriesType, theme);

        expect(result!.every((series) => series.type === seriesType)).toBe(true);
      }
    );
  });

  describe('per-field series type override', () => {
    it('uses a field custom.seriesType override over the panel default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'requests', type: FieldType.number, values: [10, 20], config: { custom: { seriesType: 'bar' } } },
          { name: 'latency', type: FieldType.number, values: [1, 2] },
        ],
      });

      const result = timeSeriesToEChartsOption([frame], 'line', theme);

      // Overridden field becomes a bar; the other keeps the panel default line.
      expect(result![0]).toMatchObject({ name: 'requests', type: 'bar' });
      expect(result![1]).toMatchObject({ name: 'latency', type: 'line' });
    });

    it('ignores a non-cartesian override and falls back to the default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'cpu', type: FieldType.number, values: [10, 20], config: { custom: { seriesType: 'pie' } } },
        ],
      });

      const result = timeSeriesToEChartsOption([frame], 'line', theme);

      expect(result![0].type).toBe('line');
    });
  });

  describe('frames that cannot produce time series', () => {
    it('returns null for an empty frame list', () => {
      expect(timeSeriesToEChartsOption([], 'line', theme)).toBeNull();
    });

    it('returns null when no frame has a time field', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'host', type: FieldType.string, values: ['a', 'b'] },
          { name: 'cpu', type: FieldType.number, values: [1, 2] },
        ],
      });

      expect(timeSeriesToEChartsOption([frame], 'line', theme)).toBeNull();
    });

    it('returns null when a timed frame has no numeric field', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'host', type: FieldType.string, values: ['a', 'b'] },
        ],
      });

      expect(timeSeriesToEChartsOption([frame], 'line', theme)).toBeNull();
    });

    it('skips frames without a time field but keeps valid ones', () => {
      const valid = multiFrame('a', [1, 2], [10, 20]);
      const invalid = toDataFrame({
        fields: [{ name: 'cpu', type: FieldType.number, values: [1, 2] }],
      });

      const result = timeSeriesToEChartsOption([invalid, valid], 'line', theme);
      expect(result![0].name).toBe('a');
    });
  });
});
