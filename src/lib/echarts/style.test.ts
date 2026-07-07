import {
  createTheme,
  type Field,
  FieldColorModeId,
  FieldType,
  formattedValueToString,
  ThresholdsMode,
  toDataFrame,
} from '@grafana/data';
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

    expect(first).toEqual('#73BF69');
    expect(second).toBe('#F2CC0C');
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

    expect(getPaletteColorByIndex(0, theme)).toEqual("#73BF69");
    expect(getPaletteColorByIndex(palette.length, theme)).toBe(getPaletteColorByIndex(0, theme));
  });
});

describe('getValueFormatter', () => {
  it('honors the field unit and decimals config', () => {
    const field = numericField({ unit: 'percent', decimals: 1 });
    const format = getValueFormatter(field, theme);

    expect(formattedValueToString(format(12.345))).toEqual('12.3%');
  });

  it('returns a FormattedValue with string text for null values', () => {
    const field = numericField({ unit: 'percent' });
    const format = getValueFormatter(field, theme);

    // @ts-expect-error
    const result = format(null).text;
    expect(result).toBe('');
  });
});
