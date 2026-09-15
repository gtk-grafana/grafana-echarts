import { type Field, FieldType, toDataFrame } from '@grafana/data';
import { type CallbackDataParams, type LabelLayoutOptionCallbackParams } from 'echarts/types/dist/shared';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import {
  getGraphLabel,
  getRelationsEdgeLabel,
  getRelationsLabelLayout,
  getRelationsLabelStyle,
  getRelationsNodeLabelFormatter,
} from 'lib/echarts/relations/options/labels';
import { type TooltipSource } from 'lib/echarts/tooltip/types';
import { relationsContext, relationsOptions } from 'test/relations';
import { type PanelOptions } from 'types';

const labelParams = (dataType: 'node' | 'edge'): LabelLayoutOptionCallbackParams =>
  ({ dataType, dataIndex: 0, seriesIndex: 0 }) as LabelLayoutOptionCallbackParams;

const baseOptions = relationsOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsChartContext =>
  relationsContext({ options, seriesType: 'graph' });

describe('getRelationsLabelLayout', () => {
  it('hides overlapping node labels by default', () => {
    expect(getRelationsLabelLayout(baseOptions())?.(labelParams('node'))).toEqual({ hideOverlap: true });
  });

  it('leaves edge labels out of the overlap pass', () => {
    expect(getRelationsLabelLayout(baseOptions())?.(labelParams('edge'))).toEqual({});
  });

  it('omits the key when switched off', () => {
    expect(getRelationsLabelLayout(baseOptions({ relationsHideOverlappingLabels: false }))).toBeUndefined();
  });
});

describe('getRelationsLabelStyle', () => {
  it('truncates at the default label width', () => {
    expect(getRelationsLabelStyle(ctx())).toMatchObject({ overflow: 'truncate', width: 120 });
  });

  it('writes no overflow keys at none, which is ECharts own default', () => {
    const style = getRelationsLabelStyle(ctx(baseOptions({ relationsLabelOverflow: 'none' })));
    expect(style).not.toHaveProperty('overflow');
    expect(style).not.toHaveProperty('width');
  });

  it('honours an explicit overflow mode and width', () => {
    const style = getRelationsLabelStyle(
      ctx(baseOptions({ relationsLabelOverflow: 'break', relationsLabelWidth: 60 }))
    );
    expect(style).toMatchObject({ overflow: 'break', width: 60 });
  });
});

describe('getRelationsEdgeLabel', () => {
  it('is undefined by default, so the key is omitted', () => {
    expect(getRelationsEdgeLabel(ctx())).toBeUndefined();
  });

  it('formats an edge weight through the panel formatter when the mark has no field', () => {
    const edgeLabel = getRelationsEdgeLabel(ctx(baseOptions({ relationsShowEdgeValues: true })));

    expect(edgeLabel).toMatchObject({ show: true });
    expect(edgeLabel?.formatter({ data: { value: 12 } } as never)).toBe('12');
    // A link with no weight draws nothing rather than an empty box.
    expect(edgeLabel?.formatter({ data: {} } as never)).toBe('');
  });
});

describe('getGraphLabel', () => {
  it('shows labels by default', () => {
    expect(getGraphLabel(ctx())).toMatchObject({ show: true, position: 'bottom' });
  });

  it('hides labels when switched off', () => {
    expect(getGraphLabel(ctx(baseOptions({ relationsShowNodeLabels: false })))).toEqual({ show: false });
  });

  it('omits the formatter while node values are off', () => {
    expect(getGraphLabel(ctx())).not.toHaveProperty('formatter');
  });

  it('adds a formatter when node values are switched on', () => {
    const label = getGraphLabel(ctx(baseOptions({ relationsShowNodeValues: true })));

    expect(typeof label).toBe('object');
    expect(typeof (label as { formatter?: unknown }).formatter).toBe('function');
  });
});

describe('getRelationsNodeLabelFormatter', () => {
  const params = (name: string, item: Record<string, unknown>) =>
    ({ name, data: item }) as unknown as CallbackDataParams;

  /** A mark's field + row, as `getRelationsTooltipMarks` builds it. */
  const markSource = (name: string): TooltipSource => ({
    field: toDataFrame({ fields: [{ name, type: FieldType.number, values: [42] }] }).fields[0] as Field,
    rowIndex: 0,
  });

  it('returns nothing while the option is off, so each variant keeps its own formatter', () => {
    expect(getRelationsNodeLabelFormatter(ctx())).toBeUndefined();
  });

  it('reads the stat from `value` (graph items)', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('A', { id: 'a', name: 'A', value: 42 }))).toBe('A\n42');
  });

  it('reads the stat from `stat` (sankey/chord items)', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('B', { id: 'b', name: 'B', stat: 7 }))).toBe('B\n7');
  });

  it('prefers `stat` over `value`', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('C', { id: 'c', name: 'C', stat: 5, value: 900 }))).toBe('C\n5');
  });

  it('leaves a statless node on one line rather than adding a blank one', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('D', { id: 'd', name: 'D' }))).toBe('D');
  });

  it('formats the stat with the node’s own field, like the tooltip', () => {
    const withMarks: RelationsSeriesContext = {
      ...ctx(baseOptions({ relationsShowNodeValues: true })),
      marks: {
        nodes: new Map([
          ['a', { formatValue: (value: number) => ({ text: `${value}`, suffix: ' ms' }), source: markSource('a') }],
        ]),
        links: new Map(),
      },
    };

    const formatter = getRelationsNodeLabelFormatter(withMarks)!;

    expect(formatter(params('A', { id: 'a', name: 'A', value: 42 }))).toBe('A\n42 ms');
    expect(formatter(params('Z', { id: 'z', name: 'Z', value: 42 }))).toBe('Z\n42');
  });
});
