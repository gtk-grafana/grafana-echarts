import { buildThresholdMarks, type ThresholdMark } from 'lib/echarts/options/thresholds';

// Three steps with a `-Infinity` base, matching a resolved Grafana threshold set.
const steps: ThresholdMark[] = [
  { value: -Infinity, color: 'green' },
  { value: 40, color: 'orange' },
  { value: 70, color: 'red' },
];

describe('buildThresholdMarks', () => {
  it('draws a solid markLine per finite step and no area for the line mode', () => {
    const marks = buildThresholdMarks(steps, { line: true, dashed: false, area: false });

    expect(marks.markArea).toBeUndefined();
    // The -Infinity base step has no line.
    expect(marks.markLine?.data).toEqual([
      { yAxis: 40, lineStyle: { color: 'orange', type: 'solid' } },
      { yAxis: 70, lineStyle: { color: 'red', type: 'solid' } },
    ]);
    expect(marks.markLine?.symbol).toBe('none');
    expect(marks.markLine?.silent).toBe(true);
  });

  it('dashes the lines for the dashed mode', () => {
    const marks = buildThresholdMarks(steps, { line: true, dashed: true, area: false });

    expect(
      marks.markLine?.data?.every((item) => (item as { lineStyle: { type: string } }).lineStyle.type === 'dashed')
    ).toBe(true);
  });

  it('draws filled bands pinned to the grid edges for the area mode', () => {
    const marks = buildThresholdMarks(steps, { line: false, dashed: false, area: true });

    expect(marks.markLine).toBeUndefined();
    // One band per step: base band from the bottom edge, interior band between
    // finite steps, and the top band up to the top edge.
    expect(marks.markArea?.data).toEqual([
      [{ y: '100%', relativeTo: 'coordinate', itemStyle: { color: 'green', opacity: 0.1 } }, { yAxis: 40 }],
      [{ yAxis: 40, itemStyle: { color: 'orange', opacity: 0.1 } }, { yAxis: 70 }],
      [
        { yAxis: 70, itemStyle: { color: 'red', opacity: 0.1 } },
        { y: '0%', relativeTo: 'coordinate' },
      ],
    ]);
  });

  it('draws both lines and areas for the combined mode', () => {
    const marks = buildThresholdMarks(steps, { line: true, dashed: false, area: true });

    expect(marks.markLine).toBeDefined();
    expect(marks.markArea).toBeDefined();
  });

  it('draws nothing when neither line nor area is requested', () => {
    expect(buildThresholdMarks(steps, { line: false, dashed: false, area: false })).toEqual({});
  });
});
