import { type MarkAreaComponentOption, type MarkLineComponentOption } from 'echarts';
import { type MarkArea2DDataItemOption } from 'echarts/types/src/component/marker/MarkAreaModel';

// Build ECharts `markLine`/`markArea` overlays for Grafana thresholds. Pure
// ECharts: inputs are already resolved to absolute y values and colors by the
// Grafana adapter (lib/grafana/fields/thresholds.ts).
// https://echarts.apache.org/en/option.html#series-line.markLine
// https://echarts.apache.org/en/option.html#series-line.markArea

/** A threshold step: an absolute y value (base step is `-Infinity`) and color. */
export interface ThresholdMark {
  value: number;
  color: string;
}

/** Which visuals to draw for the thresholds. */
export interface ThresholdDisplay {
  line: boolean;
  dashed: boolean;
  area: boolean;
}

export interface ThresholdMarks {
  markLine?: MarkLineComponentOption;
  markArea?: MarkAreaComponentOption;
}

/** Fill opacity for threshold regions; kept low so series stay legible. */
const AREA_OPACITY = 0.1;

/**
 * Build the `markLine`/`markArea` overlays for a series from resolved threshold
 * steps and the requested display. Returns an empty object when nothing renders.
 */
export function buildThresholdMarks(steps: ThresholdMark[], display: ThresholdDisplay): ThresholdMarks {
  const marks: ThresholdMarks = {};
  if (display.line) {
    marks.markLine = buildMarkLine(steps, display.dashed);
  }
  if (display.area) {
    marks.markArea = buildMarkArea(steps);
  }
  return marks;
}

/** A horizontal line per finite step (the `-Infinity` base step has no line). */
function buildMarkLine(steps: ThresholdMark[], dashed: boolean): MarkLineComponentOption {
  return {
    silent: true,
    symbol: 'none',
    label: { show: false },
    data: steps
      .filter((step) => Number.isFinite(step.value))
      .map((step) => ({
        yAxis: step.value,
        lineStyle: { color: step.color, type: dashed ? 'dashed' : 'solid' },
      })),
  };
}

/**
 * Filled bands: each step colors the region from its own value up to the next
 * step's value. The open lower/upper ends are pinned to the grid edges with
 * coordinate-relative percentages (`y: '100%'` bottom, `y: '0%'` top) so the
 * `-Infinity` base and the open top never reach ECharts as coordinates.
 */
function buildMarkArea(steps: ThresholdMark[]): MarkAreaComponentOption {
  const data: MarkArea2DDataItemOption[] = steps.map((step, index) => {
    const next = steps[index + 1];
    const lower = Number.isFinite(step.value)
      ? { yAxis: step.value }
      : { y: '100%', relativeTo: 'coordinate' as const };
    const upper = next ? { yAxis: next.value } : { y: '0%', relativeTo: 'coordinate' as const };

    return [{ ...lower, itemStyle: { color: step.color, opacity: AREA_OPACITY } }, upper];
  });

  return { silent: true, data };
}
