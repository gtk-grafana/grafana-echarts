import { type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { act, renderHook } from '@testing-library/react';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { type PanelOptions } from 'types';
import { useRelationsPersistence } from './useRelationsPersistence';

const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const options = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({
    legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
    tooltip: { mode: 'single' },
    ...extra,
  }) as PanelOptions;

/** A wide response naming every mark, so an override lands on a real field. */
const frames = () => [
  toDataFrame({
    fields: [
      { name: 'gateway', type: FieldType.number, values: [1] },
      { name: 'db', type: FieldType.number, values: [2] },
    ],
  }),
];

const context = (extra: Partial<ChartContext> = {}): ChartContext =>
  ({
    frames: frames(),
    seriesType: 'graph',
    options: options({ relationsDraggable: true }),
    fieldConfig: emptyFieldConfig,
    ...extra,
  }) as unknown as ChartContext;

function createFakeChart(series: Record<string, unknown> = {}) {
  const chartHandlers: Record<string, Array<(arg: never) => void>> = {};
  const zrHandlers: Record<string, Array<(arg: never) => void>> = {};
  const zr = {
    on: (event: string, handler: (arg: never) => void) => void (zrHandlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: never) => void) => {
      zrHandlers[event] = (zrHandlers[event] ?? []).filter((h) => h !== handler);
    },
  };
  const chart = {
    getZr: () => zr,
    isDisposed: () => false,
    on: (event: string, handler: (arg: never) => void) => void (chartHandlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: never) => void) => {
      chartHandlers[event] = (chartHandlers[event] ?? []).filter((h) => h !== handler);
    },
    getOption: () => ({ series: [series] }),
    convertFromPixel: (_finder: unknown, point: number[]) => point,
  };
  return {
    chart: chart as unknown as EChartsType,
    emit: (event: string, arg?: unknown) => (chartHandlers[event] ?? []).forEach((h) => h(arg as never)),
    emitZr: (event: string, arg?: unknown) => (zrHandlers[event] ?? []).forEach((h) => h(arg as never)),
  };
}

const render = (fake: ReturnType<typeof createFakeChart>, ctx: ChartContext = context()) => {
  const onFieldConfigChange = jest.fn();
  const onOptionsChange = jest.fn();
  renderHook(() => useRelationsPersistence(fake.chart, { chartContext: ctx, onFieldConfigChange, onOptionsChange }));
  return { onFieldConfigChange, onOptionsChange };
};

/** A graph node `mousedown`, as ECharts reports one. */
const nodeMouseDown = (item: Record<string, unknown>, at: { x: number; y: number }) => ({
  componentType: 'series',
  dataType: 'node',
  data: item,
  event: { offsetX: at.x, offsetY: at.y },
});

describe('useRelationsPersistence', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  describe('graph node drag', () => {
    it('writes the dragged node’s new position as a byName override', () => {
      const fake = createFakeChart();
      const { onFieldConfigChange } = render(fake);

      act(() => {
        fake.emit('mousedown', nodeMouseDown({ id: 'gateway', x: 60, y: 150 }, { x: 65, y: 154 }));
        fake.emitZr('dragend', { offsetX: 105, offsetY: 84 });
      });

      expect(onFieldConfigChange).toHaveBeenCalledWith({
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'gateway' },
            properties: [
              { id: 'custom.fixedX', value: 100 },
              { id: 'custom.fixedY', value: 80 },
            ],
          },
        ],
      });
    });

    it('ignores a node carrying no position, which is every other layout', () => {
      const fake = createFakeChart();
      const { onFieldConfigChange } = render(fake);

      act(() => {
        fake.emit('mousedown', nodeMouseDown({ id: 'gateway' }, { x: 65, y: 154 }));
        fake.emitZr('dragend', { offsetX: 105, offsetY: 84 });
      });

      expect(onFieldConfigChange).not.toHaveBeenCalled();
    });

    it('ignores a drag when Draggable nodes is off', () => {
      const fake = createFakeChart();
      const { onFieldConfigChange } = render(fake, context({ options: options() }));

      act(() => {
        fake.emit('mousedown', nodeMouseDown({ id: 'gateway', x: 60, y: 150 }, { x: 65, y: 154 }));
        fake.emitZr('dragend', { offsetX: 105, offsetY: 84 });
      });

      expect(onFieldConfigChange).not.toHaveBeenCalled();
    });

    it('writes for a mark no field answers to, which the reader reads back by name', () => {
      const fake = createFakeChart();
      const { onFieldConfigChange } = render(fake);

      act(() => {
        fake.emit('mousedown', nodeMouseDown({ id: 'cache', x: 60, y: 150 }, { x: 65, y: 154 }));
        fake.emitZr('dragend', { offsetX: 105, offsetY: 84 });
      });

      expect(onFieldConfigChange).toHaveBeenCalledWith({
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'cache' },
            properties: [
              { id: 'custom.fixedX', value: 100 },
              { id: 'custom.fixedY', value: 80 },
            ],
          },
        ],
      });
    });

    it('records every rendered node’s position, not just the dragged one', () => {
      const fake = createFakeChart({
        data: [
          { id: 'gateway', x: 60, y: 150 },
          { id: 'db', x: 340, y: 150 },
          // No coordinate: nothing to keep, and inventing one would stack it on the origin.
          { id: 'cache' },
        ],
      });
      const { onFieldConfigChange } = render(fake);

      act(() => {
        fake.emit('mousedown', nodeMouseDown({ id: 'gateway', x: 60, y: 150 }, { x: 65, y: 154 }));
        fake.emitZr('dragend', { offsetX: 105, offsetY: 84 });
      });

      const written: FieldConfigSource = onFieldConfigChange.mock.calls[0][0];
      expect(written.overrides.map((rule) => rule.matcher.options)).toEqual(['gateway', 'db']);
      // The dragged node moves. The other node stays in place.
      expect(written.overrides[0].properties).toEqual([
        { id: 'custom.fixedX', value: 100 },
        { id: 'custom.fixedY', value: 80 },
      ]);
      expect(written.overrides[1].properties).toEqual([
        { id: 'custom.fixedX', value: 340 },
        { id: 'custom.fixedY', value: 150 },
      ]);
    });

    it('ignores an edge press', () => {
      const fake = createFakeChart();
      const { onFieldConfigChange } = render(fake);

      act(() => {
        fake.emit('mousedown', {
          ...nodeMouseDown({ id: 'gateway', x: 60, y: 150 }, { x: 65, y: 154 }),
          dataType: 'edge',
        });
        fake.emitZr('dragend', { offsetX: 105, offsetY: 84 });
      });

      expect(onFieldConfigChange).not.toHaveBeenCalled();
    });
  });

  describe('sankey node drag', () => {
    it('writes the local position the dragNode action reports', () => {
      const fake = createFakeChart({ data: [{ id: 'gateway' }, { id: 'db' }] });
      const { onFieldConfigChange } = render(fake, context({ seriesType: 'sankey' }));

      act(() => {
        fake.emit('dragnode', { dataIndex: 1, localX: 0.25, localY: 0.5 });
        fake.emit('dragnode', { dataIndex: 1, localX: 0.4, localY: 0.6 });
        jest.runAllTimers();
      });

      expect(onFieldConfigChange).toHaveBeenCalledTimes(1);
      expect(onFieldConfigChange.mock.calls[0][0].overrides).toEqual([
        {
          matcher: { id: 'byName', options: 'db' },
          properties: [
            { id: 'custom.fixedX', value: 0.4 },
            { id: 'custom.fixedY', value: 0.6 },
          ],
        },
      ]);
    });
  });

  describe('view state', () => {
    const roamed = { zoom: 2.5, center: [10, 20] };

    it('writes the roamed zoom and centre into the panel options', () => {
      const fake = createFakeChart(roamed);
      const { onOptionsChange } = render(
        fake,
        context({ options: options({ relationsRememberView: true, relationsZoom: true }) })
      );

      act(() => {
        fake.emit('graphroam', {});
        jest.runAllTimers();
      });

      expect(onOptionsChange).toHaveBeenCalledWith(
        expect.objectContaining({ relationsViewZoom: 2.5, relationsViewCenter: [10, 20] })
      );
    });

    it('writes nothing unless Remember view is on', () => {
      const fake = createFakeChart(roamed);
      const { onOptionsChange } = render(fake);

      act(() => {
        fake.emit('graphroam', {});
        jest.runAllTimers();
      });

      expect(onOptionsChange).not.toHaveBeenCalled();
    });

    it('listens on the sankey action too', () => {
      const fake = createFakeChart(roamed);
      const { onOptionsChange } = render(
        fake,
        context({ seriesType: 'sankey', options: options({ relationsRememberView: true }) })
      );

      act(() => {
        fake.emit('sankeyroam', {});
        jest.runAllTimers();
      });

      expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining({ relationsViewZoom: 2.5 }));
    });
  });
});
