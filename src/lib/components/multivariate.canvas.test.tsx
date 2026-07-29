import { type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSettledSeriesCanvasEvents, height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Multivariate canvas snapshots, mirroring `part-to-whole.canvas.test.tsx`.
// Both render types share the categorical model — each category is one
// `parallelAxis` / radar indicator, each numeric field one polyline / polygon
// (colored by the field color) — so they share the render options below and
// differ only in the seriesType the panel resolves. Most cases exercise
// parallel, whose options are the richer set; the radar block at the bottom
// covers the other branch. Series are placed on SERIES_ZLEVEL, so only that
// series-layer draw call set is committed (the axes paint on the default layer);
// see `Panel.canvas.test.tsx` for the layered-capture rationale.
//
// Rendered in Advanced editor mode so the advanced options these tests exercise
// (layout, line width/opacity) are respected as-is. In Default mode
// `applyParallelEditorModeDefaults` resets every advanced option to its default —
// including forcing `animation.enabled` back on, which would clobber the
// `animation: { enabled: false }` these snapshots rely on for determinism. The
// Default-mode reset itself is covered by the `applyParallelEditorModeDefaults`
// unit tests.
const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  ...extra,
});

const renderParallel = async (
  frames: Parameters<typeof getComponent>[0],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(frames, 'parallel', canvasOptions(options), undefined, undefined, 'multivariate', fieldConfig)
  );
  return getSettledSeriesCanvasEvents(container);
};

describe('multivariate (parallel) canvas renders', () => {
  // Each category is one axis; each numeric field is one polyline crossing them.
  const teamsFrame = toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Speed', 'Power', 'Range', 'Durability'] },
      { name: 'Team A', type: FieldType.number, values: [80, 70, 60, 90], config: { displayName: 'Team A' } },
      { name: 'Team B', type: FieldType.number, values: [60, 90, 50, 70], config: { displayName: 'Team B' } },
      { name: 'Team C', type: FieldType.number, values: [70, 50, 85, 60], config: { displayName: 'Team C' } },
    ],
  });

  describe('base', () => {
    // One axis per category, one polyline per numeric field — the default render
    // the other cases build on.
    it('one axis per category, one polyline per field', async () => {
      const { defaultEvents, seriesEvents } = await renderParallel([teamsFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('smooth', () => {
    // The Default-tier "Smooth" toggle curves each polyline through its axis
    // crossings (ECharts `series.smooth`) instead of straight segments.
    it('curves the polylines through the axis crossings', async () => {
      const { defaultEvents, seriesEvents } = await renderParallel([teamsFrame], { parallelSmooth: true });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('layout', () => {
    // Vertical layout stacks the axes top-to-bottom (ECharts `parallel.layout`),
    // so the polylines run down the panel; the default horizontal is covered above.
    it('vertical (axes top-to-bottom)', async () => {
      const { defaultEvents, seriesEvents } = await renderParallel([teamsFrame], { parallelLayout: 'vertical' });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('line style', () => {
    // Advanced `series.lineStyle.width`: thicker polylines.
    it('line width', async () => {
      const { defaultEvents, seriesEvents } = await renderParallel([teamsFrame], { parallelLineWidth: 4 });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    // Advanced `series.lineStyle.opacity` (0–100 scaled to 0–1): translucent
    // polylines to de-clutter dense bundles.
    it('line opacity', async () => {
      const { defaultEvents, seriesEvents } = await renderParallel([teamsFrame], { parallelLineOpacity: 50 });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('color', () => {
    // A byName fixed-color override pins line 'Team B' — applied to the frames via
    // the harness `fieldConfig` (as real Grafana does), so it reaches the converter
    // and rides on that line's data-item `lineStyle.color`.
    it('byName fixed-color override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'Team B' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderParallel([teamsFrame], {}, fieldConfig);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('edge cases', () => {
    // One numeric field → a single polyline across the axes.
    it('single line (one numeric field)', async () => {
      const singleFrame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['Speed', 'Power', 'Range', 'Durability'] },
          { name: 'Team A', type: FieldType.number, values: [80, 70, 60, 90], config: { displayName: 'Team A' } },
        ],
      });

      const { defaultEvents, seriesEvents } = await renderParallel([singleFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });

    // A null value leaves a gap on that axis rather than plotting a zero, so the
    // polyline breaks there.
    it('null gap (a missing value breaks the polyline)', async () => {
      const gapFrame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['Speed', 'Power', 'Range', 'Durability'] },
          { name: 'Team A', type: FieldType.number, values: [80, null, 60, 90], config: { displayName: 'Team A' } },
          { name: 'Team B', type: FieldType.number, values: [60, 90, 50, 70], config: { displayName: 'Team B' } },
        ],
      });

      const { defaultEvents, seriesEvents } = await renderParallel([gapFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
        width,
        height,
      });
    });
  });
});

// The family's other render type, over the same frames. Radar's web size is a
// percentage of the canvas rather than a layout box (see `getRadarComponent`),
// so the polygon vertices in this snapshot are what pins the radius down —
// there is no axis-layer geometry to assert against.
describe('multivariate (radar) canvas renders', () => {
  const teamsFrame = toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Speed', 'Power', 'Range', 'Durability'] },
      { name: 'Team A', type: FieldType.number, values: [80, 70, 60, 90], config: { displayName: 'Team A' } },
      { name: 'Team B', type: FieldType.number, values: [60, 90, 50, 70], config: { displayName: 'Team B' } },
    ],
  });

  it('one polygon per numeric field, filling the canvas', async () => {
    const { container } = render(
      getComponent([teamsFrame], 'radar', canvasOptions(), undefined, undefined, 'multivariate', undefined)
    );
    const { defaultEvents, seriesEvents } = await getSettledSeriesCanvasEvents(container);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, {
      width,
      height,
    });
  });
});
