import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent } from 'test/panel';

// The label-join half of the categorical-cartesian coverage: a category a frame has no
// row for must draw no symbol.
//
// **No baseline here, by construction.** `normalizeCanvasEvents` strips the transforms
// that carry each symbol's position (bars keep absolute coords, so their geometry *is* in
// a snapshot), so a picture cannot state where a *missing* symbol was not drawn.
// Comparing a full render against a gapped one keeps the claim independent of how many
// `arc` calls ECharts spends per symbol. The mixed-geometry pictures this is the
// counterpart to are in `categorical-cartesian.canvas.test.tsx`.
//
// `editorMode: 'advanced'` is required — in Default mode
// `applyCartesianEditorModeDefaults` resets `animation.enabled` back on and the draw
// calls stop being deterministic.

/** A value frame carrying its own category (label) column, as a separate query returns. */
const valueFrame = (
  refId: string,
  labelField: string,
  labels: string[],
  valueField: string,
  values: number[],
  custom?: Record<string, unknown>
): DataFrame =>
  toDataFrame({
    refId,
    fields: [
      { name: labelField, type: FieldType.string, values: labels },
      {
        name: valueField,
        type: FieldType.number,
        values,
        config: { displayName: valueField, ...(custom ? { custom } : {}) },
      },
    ],
  });

const CATEGORIES = ['x', 'a', 'b', 'c'];

/** The reported panel's bar query. */
const barFrame = () => valueFrame('Bar', 'label', CATEGORIES, 'value', [5, 8, 30, 20]);

const renderBars = async (frames: DataFrame[]) => {
  const { container } = render(
    getComponent(frames, 'bar', {
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
      editorMode: 'advanced',
    })
  );
  return getCanvasEvents(container);
};

/** Symbol draw calls on the series layer — one `arc` group per rendered point. */
const countArcs = (events: Array<{ type: string }>) =>
  events.reduce((acc, { type }) => acc + (type === 'arc' ? 1 : 0), 0);

describe('categorical cartesian label join', () => {
  const overlay = (labels: string[], values: number[]) => [
    barFrame(),
    valueFrame('Marker', 'markerLabel', labels, 'markerValue', values, { seriesType: 'scatter' }),
  ];

  it('draws one symbol fewer per category the overlay frame has no row for', async () => {
    // Overlay covers all four categories.
    const full = await renderBars(overlay(CATEGORIES, [3, 10, 20, 30]));
    // Same frame minus one category, so one symbol should disappear.
    const gapped = await renderBars(overlay(['x', 'a', 'b'], [3, 10, 20]));

    const fullArcs = countArcs(full.seriesEvents);
    const gappedArcs = countArcs(gapped.seriesEvents);

    expect(fullArcs).toBeGreaterThan(0);
    // Four symbols vs three, so the drop is exactly a quarter of the full count.
    expect(gappedArcs).toBe((fullArcs / 4) * 3);
  });
});
