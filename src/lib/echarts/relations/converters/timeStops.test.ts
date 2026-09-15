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

describe('reading a mark at a timestamp', () => {
  /** Build one ranged edge frame on a shared row grid. */
  const pivoted = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
        { name: 'a-->b', type: FieldType.number, values: [1, 2, 3] },
        { name: 'b-->c', type: FieldType.number, values: [10, 20, 30] },
      ],
    });

  describe('hasGraphTimeline', () => {
    it('is true for a ranged response with more than one stop', () => {
      expect(hasGraphTimeline([pivoted()])).toBe(true);
    });

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

    it('is empty when no frame has a row dimension', () => {
      expect(graphWideTimeline([labelledEdges()])).toEqual([]);
    });

    // Not a graph at all: no roles resolve, so there is nothing to build a timeline from.
    it('is empty when the frames are not a graph', () => {
      expect(graphWideTimeline([])).toEqual([]);
    });

    // Node and edge frames use the same instant.
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
    expect(frameToGraphWide([pivoted()], theme)!.links.map((link) => link.value)).toEqual([2, 20]);
  });

  it("resolves the timestamp against each frame's own row dimension", () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [1, 2, 3], [T0, T0 + STEP, T0 + 2 * STEP]),
      rawSeries({ source: 'b', target: 'c' }, [40, 50], [T0 + STEP, T0 + 2 * STEP]),
    ];

    const data = frameToGraphWide(frames, theme, undefined, T0 + STEP)!;

    expect(data.links.map((link) => link.value)).toEqual([2, 40]);
  });

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

  it('reads an instant frame whole, though it carries an off-grid Time column', () => {
    const nodes = graded([0.9], { type: DataFrameType.NumericMulti }, [T0 + 7]);

    const data = frameToGraphWide([pivoted(), nodes], theme, undefined, T0 + STEP)!;

    expect(data.nodes.find((node) => node.id === 'b')).toEqual(
      expect.objectContaining({ value: 0.9, color: theme.visualization.getColorByName('red') })
    );
    expect(data.links.map((link) => link.value)).toEqual([2, 20]);
  });

  /** Build an instant frame without a time column. */
  it('reads a frame with no row dimension whole', () => {
    const data = frameToGraphWide([pivoted(), graded([0.9], { type: GRAPH_NODES_WIDE })], theme, undefined, T0)!;

    expect(data.nodes.find((node) => node.id === 'b')?.value).toBe(0.9);
  });

  it('still nulls a one-row ranged frame that has no sample at the stop', () => {
    const nodes = graded([0.9], { type: DataFrameType.TimeSeriesMulti }, [T0 + 2 * STEP]);

    const data = frameToGraphWide([pivoted(), nodes], theme, undefined, T0)!;

    expect(data.nodes.find((node) => node.id === 'b')?.value).toBeNull();
  });

  it('keeps a timeless frame out of the timeline', () => {
    const instant = graded([0.9], { type: DataFrameType.NumericMulti }, [T0 + 7]);

    expect(graphWideTimeline([pivoted(), instant])).toEqual([T0, T0 + STEP, T0 + 2 * STEP]);
    expect(hasGraphTimeline([instant])).toBe(false);
  });

  it("points a mark's data link at the selected row", () => {
    const data = frameToGraphWide([pivoted()], theme, undefined, T0 + 2 * STEP)!;

    expect(data.links.map((link) => link.sourceRowIndex)).toEqual([2, 2]);
  });

  it('falls back to row 0 for a frame with no sample at the timestamp', () => {
    const frames = [rawSeries({ source: 'b', target: 'c' }, [40], [T0 + STEP])];

    expect(frameToGraphWide(frames, theme, undefined, T0)!.links[0].sourceRowIndex).toBe(0);
  });

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

  it('keeps the secondarystat label at a selected row', () => {
    const frame = pivoted();
    frame.fields[1].labels = { ...frame.fields[1].labels, secondarystat: '12 req/s' };

    const data = frameToGraphWide([frame], theme, undefined, T0)!;

    expect(data.links[0].secondaries).toEqual([{ value: '12 req/s' }]);
  });

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

  it('reads every mark as null at a timestamp no frame carries', () => {
    const data = frameToGraphWide([pivoted()], theme, undefined, T0 + 99 * STEP)!;

    expect(data.links.every((link) => link.value === 1)).toBe(true);
  });
});
