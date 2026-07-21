import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents, height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Part-to-whole funnel canvas snapshots (sibling of `part-to-whole.canvas.test.tsx`,
// which covers the pie variant). The funnel reuses the shared slice resolver
// verbatim — each numeric field is a slice (Calculate) or each row is a slice
// (All values) — and only the series layout differs (`getFunnelSeries`). Rendered
// with family 'part-to-whole' and seriesType 'funnel' so the panel resolves the
// part-to-whole module and picks the funnel variant. Like the pie, the funnel is
// axis-less, so only the series layer paints.

// Advanced editor mode purely for snapshot determinism: the funnel layout options
// these tests exercise (orient, labels, …) live in the always-visible "Funnel"
// category and so are respected in any mode, but in Default mode
// `applyPartToWholeEditorModeDefaults` still forces `animation.enabled` back on (a
// pie advanced default), which would break the `animation: { enabled: false }`
// these snapshots rely on.
const funnelOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  ...extra,
});

const renderFunnel = async (frames: Parameters<typeof getComponent>[0], options: Partial<PanelOptions>) => {
  const { container } = render(
    getComponent(frames, 'funnel', funnelOptions(options), undefined, undefined, 'part-to-whole')
  );
  return getSeriesCanvasEvents(container);
};

describe('part-to-whole funnel canvas renders', () => {
  // Wide: each numeric field is one slice, reduced by Sum → 120 / 60 / 15.
  const wideFrame = toDataFrame({
    fields: [
      { name: 'A', type: FieldType.number, values: [30, 40, 50], config: { displayName: 'A' } },
      { name: 'B', type: FieldType.number, values: [60, null, null], config: { displayName: 'B' } },
      { name: 'C', type: FieldType.number, values: [5, 10, null], config: { displayName: 'C' } },
    ],
  });

  // A category label + a value field, one row per category (the All-values case).
  const rowsFrame = toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT', 'Ops'] },
      { name: 'value', type: FieldType.number, values: [43, 25, 30, 22] },
    ],
  });

  it('default vertical funnel — one segment per numeric field', async () => {
    const { defaultEvents, seriesEvents } = await renderFunnel([wideFrame], {
      reduceOptions: { calcs: ['sum'], values: false },
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
      width,
      height,
    });
  });

  it('horizontal orient', async () => {
    const { defaultEvents, seriesEvents } = await renderFunnel([wideFrame], {
      reduceOptions: { calcs: ['sum'], values: false },
      funnelOrient: 'horizontal',
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
      width,
      height,
    });
  });

  it('name + value + percent labels (All values, one segment per row)', async () => {
    const { defaultEvents, seriesEvents } = await renderFunnel([rowsFrame], {
      reduceOptions: { calcs: [], values: true },
      displayLabels: ['name', 'value', 'percent'],
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
      width,
      height,
    });
  });
});
