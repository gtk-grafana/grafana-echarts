import { createTheme, type Field, FieldType, toDataFrame } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

import { type PieSliceModel } from 'lib/echarts/converters/types';
import { buildPieTooltipModel } from 'lib/echarts/tooltip/pie';

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

const labels = (rows: Array<{ label: string }>) => rows.map((row) => row.label);
const values = (rows: Array<{ value: string }>) => rows.map((row) => row.value);

describe('buildPieTooltipModel', () => {
  describe('Single mode', () => {
    it('shows only the hovered slice: name header, value, and share of the whole', () => {
      const model = buildPieTooltipModel(
        slices,
        TooltipDisplayMode.Single,
        theme
      )(asParams({ dataIndex: 0, name: 'A', value: 30 }));

      expect(model.header).toBe('A');
      expect(model.rows).toHaveLength(1);
      expect(model.rows[0].value).toBe('30 (30%)');
      expect(model.rows[0].color).toBe('#aaaaaa');
      // Other slices are not listed in Single mode.
      expect(labels(model.rows)).not.toContain('B');
      // The footer source points at the hovered slice's field.
      expect(model.source?.field).toBe(slices[0].field);
    });

    it('never falls back to the ECharts auto series name ("series 0")', () => {
      const model = buildPieTooltipModel(
        slices,
        TooltipDisplayMode.Single,
        theme
      )(asParams({ dataIndex: 2, name: 'C', value: 20 }));

      expect(model.header).toBe('C');
      expect(model.header).not.toContain('series');
    });

    it('resolves the hovered slice by name when dataIndex is absent', () => {
      const model = buildPieTooltipModel(slices, TooltipDisplayMode.Single, theme)(asParams({ name: 'B', value: 50 }));

      expect(model.header).toBe('B');
      expect(model.rows[0].value).toBe('50 (50%)');
    });
  });

  describe('All mode', () => {
    it('lists every visible slice with value and percentage, headed by the hovered one', () => {
      const model = buildPieTooltipModel(
        slices,
        TooltipDisplayMode.Multi,
        theme
      )(asParams({ dataIndex: 1, name: 'B', value: 50 }));

      expect(model.header).toBe('B');
      expect(values(model.rows)).toEqual(['30 (30%)', '50 (50%)', '20 (20%)']);
    });

    it('emphasizes exactly the hovered slice row', () => {
      const model = buildPieTooltipModel(
        slices,
        TooltipDisplayMode.Multi,
        theme
      )(asParams({ dataIndex: 1, name: 'B', value: 50 }));

      const emphasized = model.rows.filter((row) => row.emphasis);
      expect(emphasized).toHaveLength(1);
      expect(emphasized[0].label).toBe('B');
    });

    it('computes percentages from the total, whole number by default (core Grafana)', () => {
      const thirds: PieSliceModel[] = [slice('x', 1, '#111111'), slice('y', 2, '#222222')];
      const model = buildPieTooltipModel(
        thirds,
        TooltipDisplayMode.Multi,
        theme
      )(asParams({ dataIndex: 0, name: 'x', value: 1 }));

      expect(values(model.rows)).toEqual(['1 (33%)', '2 (67%)']);
    });

    it('drops zero-value slices when hideZeros is set, keeping slice order and emphasis', () => {
      const withZero: PieSliceModel[] = [
        slice('A', 30, '#aaaaaa'),
        slice('Z', 0, '#000000'),
        slice('B', 50, '#bbbbbb'),
      ];
      const model = buildPieTooltipModel(
        withZero,
        TooltipDisplayMode.Multi,
        theme,
        undefined,
        true
      )(asParams({ dataIndex: 2, name: 'B', value: 50 }));

      // Two rows remain (A and B); the zero slice Z is gone.
      expect(labels(model.rows)).toEqual(['A', 'B']);
      // Emphasis still lands on the hovered slice B, whose original index (2) is unchanged.
      const emphasized = model.rows.filter((row) => row.emphasis);
      expect(emphasized).toHaveLength(1);
      expect(emphasized[0].label).toBe('B');
    });

    it('keeps null-valued slices even when hideZeros is set', () => {
      const withNull: PieSliceModel[] = [slice('A', 30, '#aaaaaa'), slice('N', undefined, '#999999')];
      const model = buildPieTooltipModel(
        withNull,
        TooltipDisplayMode.Multi,
        theme,
        undefined,
        true
      )(asParams({ dataIndex: 0, name: 'A', value: 30 }));

      expect(labels(model.rows)).toEqual(['A', 'N']);
    });
  });
});
