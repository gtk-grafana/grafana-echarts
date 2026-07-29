import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { multivariateChartModule, radarChartModule } from 'lib/echarts/charts/multivariate';
import { type ChartContext } from 'lib/echarts/charts/types';

const theme = createTheme();

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

/**
 * Minimal context for the tooltip resolvers, which only read the frames, theme,
 * time zone and panel-wide fallback formatter.
 */
const makeContext = (): ChartContext =>
  ({
    frames: [tableFrame()],
    theme,
    timeZone: 'utc',
    formatValue: (value: unknown) => ({ text: String(value) }),
    options: {},
  }) as unknown as ChartContext;

// Radar and parallel are one module over one categorical model: each numeric
// field becomes a single data item (a polygon / a polyline) of a single series.
// The tooltip resolvers key off `dataIndex` for exactly that reason, so they are
// shared by both render types.
describe('multivariateChartModule tooltips', () => {
  it('clamps the tooltip to Single for the whole family', () => {
    // One formatter param carries the entire indicator/axis array for both render
    // types, so an "All" tooltip would repeat that row rather than list the axes.
    expect(multivariateChartModule.singleTooltipOnly).toBe(true);
  });

  it('resolves a value formatter per data item via dataIndex', () => {
    const resolve = multivariateChartModule.getTooltipValueFormatter?.(makeContext());
    expect(resolve).toBeDefined();
    expect(typeof resolve!({ dataIndex: 0 })).toBe('function');
    expect(typeof resolve!({ dataIndex: 1 })).toBe('function');
  });

  it('resolves each data item back to its source field for data links', () => {
    const resolve = multivariateChartModule.getTooltipFieldResolver?.(makeContext());
    expect(resolve).toBeDefined();

    // A polygon/polyline reduces a whole field, so links resolve at row 0.
    expect(resolve!({ dataIndex: 0 })).toMatchObject({ field: { name: 'Budget' }, rowIndex: 0 });
    expect(resolve!({ dataIndex: 1 })).toMatchObject({ field: { name: 'Actual' }, rowIndex: 0 });
  });

  it('resolves no field for a missing or out-of-range dataIndex', () => {
    const resolve = multivariateChartModule.getTooltipFieldResolver?.(makeContext());
    expect(resolve!({})).toBeUndefined();
    expect(resolve!({ dataIndex: 99 })).toBeUndefined();
  });

  it('keeps the radar alias pointing at the family module', () => {
    expect(radarChartModule).toBe(multivariateChartModule);
  });
});
