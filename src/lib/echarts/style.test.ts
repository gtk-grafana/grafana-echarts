import { createTheme, type Field, FieldColorModeId, FieldType, ThresholdsMode, toDataFrame } from '@grafana/data';
import { getPaletteColorByIndex, getSeriesColor, getValueFormatter } from 'lib/echarts/style';

const theme = createTheme();

const numericField = (config: Field['config'], values: Array<number | null> = [1, 2, 3]): Field => {
  const frame = toDataFrame({
    fields: [{ name: 'v', type: FieldType.number, values, config }],
  });
  return frame.fields[0];
};

describe('getSeriesColor', () => {
  it('returns distinct classic-palette colors for different series indices', () => {
    const field = numericField({ color: { mode: FieldColorModeId.PaletteClassic } });

    field.state = { seriesIndex: 0 };
    const first = getSeriesColor(field, theme);

    field.state = { seriesIndex: 1 };
    const second = getSeriesColor(field, theme);

    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  it('colors by value when the field uses a by-value color mode', () => {
    const field = numericField(
      {
        color: { mode: FieldColorModeId.Thresholds },
        thresholds: {
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: 'green' },
            { value: 50, color: 'red' },
          ],
        },
      },
      [80]
    );

    // Reduced "last" value (80) crosses the 50 threshold -> the red step color.
    expect(getSeriesColor(field, theme)).toBe(theme.visualization.getColorByName('red'));
  });
});

describe('getPaletteColorByIndex', () => {
  it('cycles through the palette and resolves a color string', () => {
    const { palette } = theme.visualization;

    expect(getPaletteColorByIndex(0, theme)).toEqual(expect.any(String));
    expect(getPaletteColorByIndex(palette.length, theme)).toBe(getPaletteColorByIndex(0, theme));
  });
});

describe('getValueFormatter', () => {
  it('honors the field unit and decimals config', () => {
    const field = numericField({ unit: 'percent', decimals: 1 });
    const format = getValueFormatter(field, theme);

    expect(format(12.345)).toMatch(/^12\.3\s*%$/);
  });

  it('returns a string for null values', () => {
    const field = numericField({ unit: 'percent' });
    const format = getValueFormatter(field, theme);

    expect(typeof format(null)).toBe('string');
  });
});
