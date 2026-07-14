import { createTheme, type Field, FieldType, ThresholdsMode, toDataFrame } from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';
import {
  findThresholdField,
  getThresholdsStyleMode,
  resolveFieldThresholds,
  thresholdDisplayForMode,
} from 'lib/grafana/fields/thresholds';

const theme = createTheme();

const numericField = (config: Field['config'], values: number[] = [0, 50, 100]): Field =>
  toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values, config }] }).fields[0];

describe('getThresholdsStyleMode', () => {
  it('defaults to Off when no custom config is set', () => {
    expect(getThresholdsStyleMode(numericField({}))).toBe(GraphThresholdsStyleMode.Off);
  });

  it('reads the field custom thresholdsStyle mode', () => {
    const field = numericField({ custom: { thresholdsStyle: { mode: GraphThresholdsStyleMode.LineAndArea } } });
    expect(getThresholdsStyleMode(field)).toBe(GraphThresholdsStyleMode.LineAndArea);
  });
});

describe('thresholdDisplayForMode', () => {
  it.each([
    [GraphThresholdsStyleMode.Line, { line: true, dashed: false, area: false }],
    [GraphThresholdsStyleMode.Dashed, { line: true, dashed: true, area: false }],
    [GraphThresholdsStyleMode.Area, { line: false, dashed: false, area: true }],
    [GraphThresholdsStyleMode.LineAndArea, { line: true, dashed: false, area: true }],
    [GraphThresholdsStyleMode.DashedAndArea, { line: true, dashed: true, area: true }],
  ])('maps %s to render flags', (mode, flags) => {
    expect(thresholdDisplayForMode(mode)).toEqual(flags);
  });

  it('returns null for Off and the out-of-scope Series mode', () => {
    expect(thresholdDisplayForMode(GraphThresholdsStyleMode.Off)).toBeNull();
    expect(thresholdDisplayForMode(GraphThresholdsStyleMode.Series)).toBeNull();
  });
});

describe('resolveFieldThresholds', () => {
  it('returns null when the field has no thresholds', () => {
    expect(resolveFieldThresholds(numericField({}), theme)).toBeNull();
  });

  it('resolves absolute step values and theme colors, keeping the base step', () => {
    const field = numericField({
      thresholds: {
        mode: ThresholdsMode.Absolute,
        steps: [
          { value: -Infinity, color: 'green' },
          { value: 40, color: 'red' },
        ],
      },
    });

    expect(resolveFieldThresholds(field, theme)).toEqual([
      { value: -Infinity, color: theme.visualization.getColorByName('green') },
      { value: 40, color: theme.visualization.getColorByName('red') },
    ]);
  });

  it('maps percentage steps onto the field min/max range', () => {
    const field = numericField({
      min: 0,
      max: 200,
      thresholds: {
        mode: ThresholdsMode.Percentage,
        // Percentage steps are on a 0-100 scale: 50% of [0, 200] === 100.
        steps: [
          { value: -Infinity, color: 'green' },
          { value: 50, color: 'red' },
        ],
      },
    });

    expect(resolveFieldThresholds(field, theme)).toEqual([
      { value: -Infinity, color: theme.visualization.getColorByName('green') },
      { value: 100, color: theme.visualization.getColorByName('red') },
    ]);
  });
});

describe('findThresholdField', () => {
  const activeConfig = {
    custom: { thresholdsStyle: { mode: GraphThresholdsStyleMode.Line } },
    thresholds: { mode: ThresholdsMode.Absolute, steps: [{ value: -Infinity, color: 'green' }] },
  };

  it('returns the first field whose display is active and has steps', () => {
    const plain = numericField({});
    const active = numericField(activeConfig);
    expect(findThresholdField([plain, active])).toBe(active);
  });

  it('ignores fields whose style is Off even when steps are configured', () => {
    const field = numericField({
      thresholds: { mode: ThresholdsMode.Absolute, steps: [{ value: -Infinity, color: 'green' }] },
    });
    expect(findThresholdField([field])).toBeUndefined();
  });

  it('ignores fields with an active style but no steps', () => {
    const field = numericField({ custom: { thresholdsStyle: { mode: GraphThresholdsStyleMode.Line } } });
    expect(findThresholdField([field])).toBeUndefined();
  });
});
