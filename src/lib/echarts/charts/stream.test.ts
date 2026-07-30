import {
  createDataFrame,
  createTheme,
  dateTime,
  type FieldConfigSource,
  FieldMatcherID,
  FieldType,
  type TimeRange,
  type ValueFormatter,
} from '@grafana/data';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type PanelOptions } from 'types';
import { streamChartModule } from './stream';

const theme = createTheme();

const timeRange: TimeRange = {
  from: dateTime(1000),
  to: dateTime(3000),
  raw: { from: 'now-1h', to: 'now' },
};

const formatValue: ValueFormatter = (value) => ({ text: String(value) });

const wideFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      { name: 'debug', type: FieldType.number, values: [1, 2] },
      { name: 'error', type: FieldType.number, values: [3, 4] },
    ],
  });

/** Per-series "Hide in area" overrides, the manual half of the hidden-series set. */
const hideByName = (...names: string[]): FieldConfigSource => ({
  defaults: {},
  overrides: names.map((name) => ({
    matcher: { id: FieldMatcherID.byName, options: name },
    properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
  })),
});

const makeContext = (
  frames = [wideFrame()],
  fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] },
  options: Partial<PanelOptions> = {}
): ChartContext => ({
  frames,
  theme,
  timeZone: 'utc',
  timeRange,
  options: options as PanelOptions,
  seriesType: 'themeRiver',
  formatValue,
  fieldConfig,
  replaceVariables: (value: string) => value,
});

describe('streamChartModule', () => {
  describe('buildOption', () => {
    it('builds a themeRiver series on a time single axis', () => {
      const option = streamChartModule.buildOption(makeContext(), { isGrafanaLegend: true });

      expect(option).not.toBeNull();
      const series = Array.isArray(option?.series) ? option?.series : [option?.series];
      expect(series?.[0]).toMatchObject({ type: 'themeRiver' });
      // `singleAxis` is added by hand: the series has no layout box of its own and
      // reuses the axis' (see `getStreamSingleAxis`).
      expect(option).toMatchObject({ singleAxis: expect.objectContaining({ type: 'time' }) });
    });

    it('returns null when no layer can be derived, so the panel can show no data', () => {
      const numericOnly = createDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['a', 'b'] },
          { name: 'value', type: FieldType.number, values: [1, 2] },
        ],
      });

      expect(streamChartModule.buildOption(makeContext([numericOnly]), { isGrafanaLegend: true })).toBeNull();
    });

    it('builds one scatter row per layer for the bubble variant', () => {
      // The variant rides on the family-local `streamChartType`, not `seriesType`:
      // `scatter` is routed to the cartesian family by `resolveChartModule`.
      const option = streamChartModule.buildOption(
        makeContext([wideFrame()], { defaults: {}, overrides: [] }, { streamChartType: 'bubble' }),
        { isGrafanaLegend: true }
      );

      const series = Array.isArray(option?.series) ? option?.series : [option?.series];
      expect(series?.map((entry) => entry?.type)).toEqual(['scatter', 'scatter']);
      // One axis per row, so the stack and the `singleAxisIndex` pairing line up.
      expect(Array.isArray(option?.singleAxis) ? option?.singleAxis : []).toHaveLength(2);
    });

    it('drops a hidden layer’s row from the bubble stack, not just its series', () => {
      // An axis left behind would render an empty labelled row.
      const option = streamChartModule.buildOption(
        makeContext([wideFrame()], hideByName('error'), { streamChartType: 'bubble' }),
        { isGrafanaLegend: true }
      );

      const series = Array.isArray(option?.series) ? option?.series : [option?.series];
      expect(series).toHaveLength(1);
      expect(Array.isArray(option?.singleAxis) ? option?.singleAxis : []).toHaveLength(1);
    });

    it('renders the river when the variant is unset', () => {
      const option = streamChartModule.buildOption(makeContext(), { isGrafanaLegend: true });

      const series = Array.isArray(option?.series) ? option?.series : [option?.series];
      expect(series?.[0]).toMatchObject({ type: 'themeRiver' });
    });

    it('still builds an option when every layer is hidden', () => {
      // Hiding the last visible layer from the legend must not take the panel down:
      // `buildPanelChartOption` throws on a null option.
      const option = streamChartModule.buildOption(makeContext([wideFrame()], hideByName('debug', 'error')), {
        isGrafanaLegend: true,
      });

      const series = Array.isArray(option?.series) ? option?.series : [option?.series];
      expect(series?.[0]).toMatchObject({ type: 'themeRiver', data: [] });
    });
  });

  describe('buildLegendItems', () => {
    it('lists one item per layer with its ribbon color', () => {
      const items = streamChartModule.buildLegendItems(makeContext(), []);

      expect(items.map((item) => item.label)).toEqual(['debug', 'error']);
      expect(items[0].color).toEqual(expect.any(String));
      expect(items.map((item) => item.disabled)).toEqual([false, false]);
    });

    it('keeps a hidden layer in the legend, greyed, so it can be toggled back', () => {
      const items = streamChartModule.buildLegendItems(makeContext([wideFrame()], hideByName('error')), []);

      expect(items.map((item) => [item.label, item.disabled])).toEqual([
        ['debug', false],
        ['error', true],
      ]);
    });

    it('returns no items when there is no usable data', () => {
      expect(streamChartModule.buildLegendItems(makeContext([]), [])).toEqual([]);
    });

    it('reduces calc columns from the layer field', () => {
      const [debug] = streamChartModule.buildLegendItems(makeContext(), ['max']);

      expect(debug.getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 2 })]);
    });
  });

  describe('family flags', () => {
    it('offers Single tooltips only, and no drag-to-zoom brush', () => {
      // An axis-triggered tooltip bypasses the series formatter this family
      // attaches, and `BrushComponent` has no cartesian grid to attach to here.
      expect(streamChartModule.singleTooltipOnly).toBe(true);
      expect(streamChartModule.disableTimeBrush).toBe(true);
    });
  });
});
