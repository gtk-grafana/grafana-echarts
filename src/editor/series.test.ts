import { FieldType, toDataFrame } from '@grafana/data';
import { frameHasCartesianOverride } from 'editor/series';

const frameWithSeriesType = (seriesType: unknown) =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1] },
      { name: 'v', type: FieldType.number, values: [1], config: { custom: { seriesType } } },
    ],
  });

describe('frameHasCartesianOverride', () => {
  it('is true when a numeric field is overridden to a cartesian type', () => {
    expect(frameHasCartesianOverride(frameWithSeriesType('line'))).toBe(true);
    expect(frameHasCartesianOverride(frameWithSeriesType('bar'))).toBe(true);
    expect(frameHasCartesianOverride(frameWithSeriesType('scatter'))).toBe(true);
  });

  it('is false when the override is a non-cartesian type', () => {
    expect(frameHasCartesianOverride(frameWithSeriesType('pie'))).toBe(false);
    expect(frameHasCartesianOverride(frameWithSeriesType('heatmap'))).toBe(false);
  });

  it('is false when no override is set', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'v', type: FieldType.number, values: [1] },
      ],
    });
    expect(frameHasCartesianOverride(frame)).toBe(false);
  });

  it('ignores overrides on non-numeric fields', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'label', type: FieldType.string, values: ['a'], config: { custom: { seriesType: 'line' } } },
        { name: 'v', type: FieldType.number, values: [1] },
      ],
    });
    expect(frameHasCartesianOverride(frame)).toBe(false);
  });
});
