import {
  type DataFrame,
  DataFrameType,
  FieldColorModeId,
  FieldType,
  type ReduceDataOptions,
  ThresholdsMode,
  toDataFrame,
} from '@grafana/data';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { graphWideTimeline, hasGraphTimeline } from 'lib/echarts/relations/converters/timeStops';
import { theme, T0, STEP, labelledEdges, rawSeries, withDisplay } from 'test/graphWide';

/**
 * Reading a mark at **one timestamp** instead of reducing its rows away — the panel's
 * time slider. Two things make this more than an index lookup: the timeline is a union
 * across frames, because the raw shape gives every edge its own time column and no two
 * need agree; and the timestamp is therefore resolved to a row **per frame**, because a
 * shared index would read one mark at another mark's instant.
 */
describe('reading a mark at a timestamp', () => {
  /** One ranged edges frame on a shared row grid — what the pivot produces. */
  const pivoted = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
        { name: 'a-->b', type: FieldType.number, values: [1, 2, 3] },
        { name: 'b-->c', type: FieldType.number, values: [10, 20, 30] },
      ],
    });

  /**
   * The switch's own visibility, which is a different question from the timeline's
   * contents: "is there anywhere to scrub to at all". See {@link hasGraphTimeline}.
   */
  describe('hasGraphTimeline', () => {
    it('is true for a ranged response with more than one stop', () => {
      expect(hasGraphTimeline([pivoted()])).toBe(true);
    });

    // Two frames of one stop each are still two stops, so the union is what decides —
    // not any single frame's row count.
    it('is true when the stops are spread across frames', () => {
      const frames = [
        rawSeries({ source: 'a', target: 'b' }, [1], [T0]),
        rawSeries({ source: 'b', target: 'c' }, [2], [T0 + STEP]),
      ];

      expect(hasGraphTimeline(frames)).toBe(true);
    });

    // One stop is an instant response with a clock on it: nowhere to scrub to.
    it('is false for a single stop, however many frames carry it', () => {
      const frames = [
        rawSeries({ source: 'a', target: 'b' }, [1], [T0]),
        rawSeries({ source: 'b', target: 'c' }, [2], [T0]),
      ];

      expect(hasGraphTimeline(frames)).toBe(false);
      expect(hasGraphTimeline([labelledEdges()])).toBe(false);
    });

    /**
     * False whenever it cannot tell — the opposite of `hasNoNodeStats`, and the note on
     * {@link hasGraphTimeline} says why: the control's own `showIf` keeps an
     * already-enabled switch visible, so hiding on "don't know" cannot strand anyone.
     */
    it('is false with no data at all', () => {
      expect(hasGraphTimeline(undefined)).toBe(false);
      expect(hasGraphTimeline([])).toBe(false);
    });

    // Not a graph in either shape: no roles resolve, so there is nothing to time.
    it('is false for frames that are not a graph', () => {
      const plain = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [T0, T0 + STEP] },
          { name: 'value', type: FieldType.number, values: [1, 2] },
        ],
      });

      expect(hasGraphTimeline([plain])).toBe(false);
    });
  });

  describe('graphWideTimeline', () => {
    it("unions every frame's stops, ascending and deduped", () => {
      // Ragged on purpose: the second series starts a step late and the third skips one,
      // which is the raw labelled shape a stock host reads without any pivot.
      const frames = [
        rawSeries({ source: 'a', target: 'b' }, [1, 2], [T0, T0 + STEP]),
        rawSeries({ source: 'b', target: 'c' }, [3, 4], [T0 + STEP, T0 + 2 * STEP]),
        rawSeries({ source: 'a', target: 'c' }, [5], [T0 + 3 * STEP]),
      ];

      expect(graphWideTimeline(frames)).toEqual([T0, T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP]);
    });

    // The pivoted shape already shares one grid, so the union is that grid unchanged.
    it('reads the shared row grid of a pivoted frame', () => {
      expect(graphWideTimeline([pivoted()])).toEqual([T0, T0 + STEP, T0 + 2 * STEP]);
    });

    /**
     * Empty on instant data, which is what hides the slider: `tempo-service-map.json`
     * and every `rowsToFields` route reach the panel with no row dimension at all.
     */
    it('is empty when no frame has a row dimension', () => {
      expect(graphWideTimeline([labelledEdges()])).toEqual([]);
    });

    // Not a graph at all: no roles resolve, so there is nothing to build a timeline from.
    it('is empty when the frames are not a graph', () => {
      expect(graphWideTimeline([])).toEqual([]);
    });

    // A nodes frame's clock counts too — its marks are read at the same instant.
    it('includes the stops a nodes frame carries', () => {
      const nodes = toDataFrame({
        meta: { type: GRAPH_NODES_WIDE },
        fields: [
          { name: 'Time', type: FieldType.time, values: [T0 + 9 * STEP] },
          { name: 'a', type: FieldType.number, values: [7] },
        ],
      });

      expect(graphWideTimeline([pivoted(), nodes])).toContain(T0 + 9 * STEP);
    });
  });

  it("takes each mark's value at the selected row rather than reducing", () => {
    const at = frameToGraphWide([pivoted()], theme, undefined, T0 + STEP)!;

    expect(at.links.map((link) => link.value)).toEqual([2, 20]);
    // The reducing reading of the same frames, for contrast. The default reducer is
    // `median` (`RELATIONS_CALC_DEFAULT`), which over three rows is the middle one — so
    // it coincides with the selected row here. The point of the assertion is that the
    // two readings are computed by different paths, which the ragged cases below
    // separate properly.
    expect(frameToGraphWide([pivoted()], theme)!.links.map((link) => link.value)).toEqual([2, 20]);
  });

  /**
   * Ragged frames, resolved **per frame**. Row 1 is a different instant in each of these,
   * which is exactly what a shared index would get wrong.
   */
  it("resolves the timestamp against each frame's own row dimension", () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [1, 2, 3], [T0, T0 + STEP, T0 + 2 * STEP]),
      rawSeries({ source: 'b', target: 'c' }, [40, 50], [T0 + STEP, T0 + 2 * STEP]),
    ];

    const data = frameToGraphWide(frames, theme, undefined, T0 + STEP)!;

    expect(data.links.map((link) => link.value)).toEqual([2, 40]);
  });

  /**
   * A mark with no sample at the selected timestamp reads `null` — the same thing an
   * all-null field reduces to today, so the existing handling applies unchanged: the edge
   * draws weightless (`value ?? 1`) rather than vanishing, and the topology stays stable
   * while scrubbing. No carry-forward, no invented data.
   */
  it('reads null where a frame has no sample at the timestamp, keeping the edge', () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [1, 2], [T0, T0 + STEP]),
      rawSeries({ source: 'b', target: 'c' }, [40], [T0 + STEP]),
    ];

    const data = frameToGraphWide(frames, theme, undefined, T0)!;

    // The second edge is still in the graph, weightless.
    expect(data.links.map((link) => [link.source, link.target, link.value])).toEqual([
      ['a', 'b', 1],
      ['b', 'c', 1],
    ]);
    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  /**
   * A graded node, as a service graph carries one: a per-node error ratio with a threshold
   * scheme on it.
   */
  const graded = (values: Array<number | null>, meta: DataFrame['meta'], times?: number[]): DataFrame =>
    withDisplay(
      toDataFrame({
        meta,
        fields: [
          ...(times ? [{ name: 'Time', type: FieldType.time, values: times }] : []),
          {
            name: 'b',
            type: FieldType.number,
            values,
            config: {
              color: { mode: FieldColorModeId.Thresholds },
              thresholds: {
                mode: ThresholdsMode.Absolute,
                steps: [
                  { color: 'green', value: -Infinity },
                  { color: 'red', value: 0.5 },
                ],
              },
            },
          },
        ],
      })
    );

  /**
   * **The reported bug.** A mixed response — a ranged edges query beside an **instant**
   * nodes query, which is how a service graph carries per-node error ratios — lost every
   * node the moment the time slider was switched on.
   *
   * The measured shape is what makes it subtle: a Prometheus instant query answers
   * `numeric-multi` and **still ships a `Time` column**, one row stamped with the
   * evaluation instant (`now`). That stamp lands nowhere near the step grid the ranged
   * query returns, so `rowAt` matched no row and every node read `null` — and a `null` node
   * is not only a missing tooltip row. It costs the node its **colour**: a by-value scheme
   * has no value to grade, so `colorOf` returns nothing and `fillPaletteColors` hands the
   * node a palette slot, which is what "thresholds stop working under the slider" was.
   *
   * So the declared kind decides and the frame keeps reducing, while the ranged edges beside
   * it still move with the slider — asserted together, since reading one frame at a
   * timestamp and another whole is the point. See `isTimelessFrame`.
   */
  it('reads an instant frame whole, though it carries an off-grid Time column', () => {
    const nodes = graded([0.9], { type: DataFrameType.NumericMulti }, [T0 + 7]);

    const data = frameToGraphWide([pivoted(), nodes], theme, undefined, T0 + STEP)!;

    expect(data.nodes.find((node) => node.id === 'b')).toEqual(
      expect.objectContaining({ value: 0.9, color: theme.visualization.getColorByName('red') })
    );
    expect(data.links.map((link) => link.value)).toEqual([2, 20]);
  });

  /** The same for a frame with no time column at all — the pivoted instant response. */
  it('reads a frame with no row dimension whole', () => {
    const data = frameToGraphWide([pivoted(), graded([0.9], { type: GRAPH_NODES_WIDE })], theme, undefined, T0)!;

    expect(data.nodes.find((node) => node.id === 'b')?.value).toBe(0.9);
  });

  /**
   * The distinction shape alone cannot make, and the reason the kind is what is read: a raw
   * **ragged** response is N frames of one sample each, and a frame that simply has no
   * sample at the selected stop still reads `null`. Backfilling it would invent data — see
   * "reads null where a frame has no sample at the timestamp" below, which this is the nodes
   * half of.
   */
  it('still nulls a one-row ranged frame that has no sample at the stop', () => {
    const nodes = graded([0.9], { type: DataFrameType.TimeSeriesMulti }, [T0 + 2 * STEP]);

    const data = frameToGraphWide([pivoted(), nodes], theme, undefined, T0)!;

    expect(data.nodes.find((node) => node.id === 'b')?.value).toBeNull();
  });

  /**
   * And it contributes no **stop**: an instant frame's evaluation instant is not somewhere
   * to scrub to. Left in, it would add a stop off the ranged grid where every edge reads
   * null and the graph goes weightless — and two instant queries stamped a moment apart
   * would raise a slider on a response with no timeline at all.
   */
  it('keeps a timeless frame out of the timeline', () => {
    const instant = graded([0.9], { type: DataFrameType.NumericMulti }, [T0 + 7]);

    expect(graphWideTimeline([pivoted(), instant])).toEqual([T0, T0 + STEP, T0 + 2 * STEP]);
    expect(hasGraphTimeline([instant])).toBe(false);
  });

  /**
   * `sourceRowIndex` is what a data link interpolates `${__value.numeric}` against, and
   * at a selected row it agrees with the tooltip — which the reducing reading cannot
   * promise, since "the row the reducer picked" is meaningless for a mean.
   */
  it("points a mark's data link at the selected row", () => {
    const data = frameToGraphWide([pivoted()], theme, undefined, T0 + 2 * STEP)!;

    expect(data.links.map((link) => link.sourceRowIndex)).toEqual([2, 2]);
  });

  // Falls back to row 0 when the frame has no sample there, so an interpolated link still
  // resolves rather than reading off the end of the field.
  it('falls back to row 0 for a frame with no sample at the timestamp', () => {
    const frames = [rawSeries({ source: 'b', target: 'c' }, [40], [T0 + STEP])];

    expect(frameToGraphWide(frames, theme, undefined, T0)!.links[0].sourceRowIndex).toBe(0);
  });

  /**
   * No secondary stats at a row: every reducer agrees over one value, so `calcs[1..]`
   * would render as duplicate tooltip rows saying the same number under different names.
   */
  it('suppresses the secondary stats at a selected row', () => {
    const options: ReduceDataOptions = { calcs: ['max', 'min', 'mean'], values: false, fields: '' };
    const reduced = frameToGraphWide([pivoted()], theme, options)!;
    const at = frameToGraphWide([pivoted()], theme, options, T0 + STEP)!;

    expect(reduced.links[0].secondaries).toEqual([
      { calc: 'min', value: '1' },
      { calc: 'mean', value: '2' },
    ]);
    expect(at.links[0].secondaries).toBeUndefined();
  });

  /**
   * The `secondarystat` label is not a reducer's output — it is one value the conversion
   * carried across for row input — so it survives the selected-row reading.
   */
  it('keeps the secondarystat label at a selected row', () => {
    const frame = pivoted();
    frame.fields[1].labels = { ...frame.fields[1].labels, secondarystat: '12 req/s' };

    const data = frameToGraphWide([frame], theme, undefined, T0)!;

    expect(data.links[0].secondaries).toEqual([{ value: '12 req/s' }]);
  });

  /**
   * Node marks read at the row too. Their frame's own clock is what resolves it, which is
   * why a nodes frame on a different grid is not silently indexed by the edges' rows.
   */
  it('reads a declared node at the selected row', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
        { name: 'a', type: FieldType.number, values: [100, 200, 300] },
      ],
    });

    const data = frameToGraphWide([pivoted(), nodes], theme, undefined, T0 + STEP)!;

    expect(data.nodes.find((node) => node.id === 'a')?.value).toBe(200);
  });

  // A timestamp no frame carries is not resolved to a neighbour here: snapping to a real
  // stop is the slider's job (`resolveTimelineIndex`), and inventing one would hide a bug.
  it('reads every mark as null at a timestamp no frame carries', () => {
    const data = frameToGraphWide([pivoted()], theme, undefined, T0 + 99 * STEP)!;

    expect(data.links.every((link) => link.value === 1)).toBe(true);
  });
});
