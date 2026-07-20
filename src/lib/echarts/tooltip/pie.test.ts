import { createTheme, type Field, FieldType, toDataFrame } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

import { type PieSliceModel } from 'lib/echarts/converters/types';
import { buildPieTooltip } from 'lib/echarts/tooltip/pie';

const theme = createTheme();

// ECharts formatter params carry more fields at runtime than the base type; the
// tests only set the ones the pie formatter reads (dataIndex/name).
const asParams = (params: unknown) => params as TopLevelFormatterParams;

const sliceField = (value: number): Field =>
  toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [value] }] }).fields[0];

const slice = (name: string, value: number | undefined, color: string): PieSliceModel => ({
  name,
  value,
  color,
  hidden: false,
  field: sliceField(value ?? 0),
});

// Three visible slices summing to 100 so percentages read cleanly.
const slices: PieSliceModel[] = [slice('A', 30, '#aaaaaa'), slice('B', 50, '#bbbbbb'), slice('C', 20, '#cccccc')];

describe('buildPieTooltip', () => {
  describe('Single mode', () => {
    it('shows only the hovered slice: name header, value, and share of the whole', () => {
      const el = buildPieTooltip(
        slices,
        TooltipDisplayMode.Single,
        theme
      )(asParams({ dataIndex: 0, name: 'A', value: 30 }));

      expect(el.textContent).toContain('A');
      expect(el.textContent).toContain('30');
      expect(el.textContent).toContain('30%');
      // Other slices are not listed in Single mode.
      expect(el.textContent).not.toContain('B');
      expect(el.textContent).not.toContain('50');
      // Exactly one swatch (the hovered slice).
      expect(el.querySelectorAll('span')).toHaveLength(1);
    });

    it('never falls back to the ECharts auto series name ("series 0")', () => {
      const el = buildPieTooltip(
        slices,
        TooltipDisplayMode.Single,
        theme
      )(asParams({ dataIndex: 2, name: 'C', value: 20 }));

      expect(el.textContent).not.toContain('series');
      expect(el.textContent).toContain('C');
    });

    it('resolves the hovered slice by name when dataIndex is absent', () => {
      const el = buildPieTooltip(slices, TooltipDisplayMode.Single, theme)(asParams({ name: 'B', value: 50 }));

      expect(el.textContent).toContain('B');
      expect(el.textContent).toContain('50%');
    });
  });

  describe('All mode', () => {
    it('lists every visible slice with value and percentage, headed by the hovered one', () => {
      const el = buildPieTooltip(
        slices,
        TooltipDisplayMode.Multi,
        theme
      )(asParams({ dataIndex: 1, name: 'B', value: 50 }));

      expect(el.textContent).toContain('30 (30%)');
      expect(el.textContent).toContain('50 (50%)');
      expect(el.textContent).toContain('20 (20%)');
      // One swatch per visible slice.
      expect(el.querySelectorAll('span')).toHaveLength(3);
    });

    it('emphasizes exactly the hovered slice row', () => {
      const el = buildPieTooltip(
        slices,
        TooltipDisplayMode.Multi,
        theme
      )(asParams({ dataIndex: 1, name: 'B', value: 50 }));

      // Emphasis is an inline font-weight on the row (the header's bold comes from
      // a CSS class, so it has no inline style).
      const boldRows = Array.from(el.querySelectorAll('div')).filter((div) => div.style.fontWeight !== '');
      expect(boldRows).toHaveLength(1);
      expect(boldRows[0].textContent).toContain('B');
    });

    it('computes percentages from the total, whole number by default (core Grafana)', () => {
      const thirds: PieSliceModel[] = [slice('x', 1, '#111111'), slice('y', 2, '#222222')];
      const el = buildPieTooltip(
        thirds,
        TooltipDisplayMode.Multi,
        theme
      )(asParams({ dataIndex: 0, name: 'x', value: 1 }));

      expect(el.textContent).toContain('33%');
      expect(el.textContent).toContain('67%');
    });

    it('drops zero-value slices when hideZeros is set, keeping slice order and emphasis', () => {
      const withZero: PieSliceModel[] = [
        slice('A', 30, '#aaaaaa'),
        slice('Z', 0, '#000000'),
        slice('B', 50, '#bbbbbb'),
      ];
      const el = buildPieTooltip(
        withZero,
        TooltipDisplayMode.Multi,
        theme,
        undefined,
        true
      )(asParams({ dataIndex: 2, name: 'B', value: 50 }));

      // Two swatches remain (A and B); the zero slice Z is gone.
      expect(el.querySelectorAll('span')).toHaveLength(2);
      expect(el.textContent).not.toContain('Z');
      // Emphasis still lands on the hovered slice B, whose original index (2) is unchanged.
      const boldRows = Array.from(el.querySelectorAll('div')).filter((div) => div.style.fontWeight !== '');
      expect(boldRows).toHaveLength(1);
      expect(boldRows[0].textContent).toContain('B');
    });

    it('keeps null-valued slices even when hideZeros is set', () => {
      const withNull: PieSliceModel[] = [slice('A', 30, '#aaaaaa'), slice('N', undefined, '#999999')];
      const el = buildPieTooltip(
        withNull,
        TooltipDisplayMode.Multi,
        theme,
        undefined,
        true
      )(asParams({ dataIndex: 0, name: 'A', value: 30 }));

      expect(el.textContent).toContain('N');
      expect(el.querySelectorAll('span')).toHaveLength(2);
    });
  });
});
