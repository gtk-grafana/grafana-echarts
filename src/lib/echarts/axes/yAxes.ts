import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { AxisPlacement } from '@grafana/schema';
import { type TimeAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import { type CartesianAxisOption, type YAXisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { mergeAxisStyle } from 'lib/echarts/options/cartesian';
import { getValueFormatter } from 'lib/echarts/style';
import { getFieldConfigFromField, getFieldMinMax } from 'lib/grafana/fields/fieldConfig';

/** Horizontal gap (px) between stacked axes sharing a side. */
export const AXIS_OFFSET_STEP = 50;

export interface CartesianYAxes {
  /** One value axis per distinct unit, in first-appearance order. */
  yAxis: YAXisOption[];
  /** Axis index for each input field, aligned to `fields` order. */
  seriesYAxisIndex: number[];
  /** Visible (non-hidden) axis counts per side, for reserving grid space. */
  leftAxisCount: number;
  rightAxisCount: number;
}

type Side = 'left' | 'right';

/** Group fields by unit, preserving first-appearance order. */
function groupFieldsByUnit(fields: Field[]): { units: string[]; byUnit: Map<string, Field[]> } {
  const units: string[] = [];
  const byUnit = new Map<string, Field[]>();
  for (const field of fields) {
    // Undefined/empty units collapse into one default group.
    const unit = getFieldConfigFromField(field).unit ?? '';
    const group = byUnit.get(unit);
    if (group) {
      group.push(field);
    } else {
      byUnit.set(unit, [field]);
      units.push(unit);
    }
  }
  return { units, byUnit };
}

/**
 * Resolve a unit group's placement: the first field with an explicit (non-auto)
 * placement wins, otherwise `Auto`. Fields sharing a unit share one axis, so a
 * single placement is chosen for the group.
 */
function resolveGroupPlacement(fields: Field[]): AxisPlacement {
  for (const field of fields) {
    const placement = getFieldConfigFromField(field).custom?.axisPlacement;
    if (placement != null && placement !== AxisPlacement.Auto) {
      return placement;
    }
  }
  return AxisPlacement.Auto;
}

/**
 * Build one y-axis per distinct field unit and map each series (field) to its
 * axis. Placement rules mirror core Grafana:
 * - `Auto`: the first unit renders on the left, additional units on the right.
 * - `Left`/`Right`: force the side.
 * - `Hidden`: the axis is not drawn but the series still plots against it.
 *
 * Axes sharing a side are offset so they don't overlap, and only the first
 * visible axis draws grid split lines to avoid a cluttered grid.
 *
 * When `fields` is empty (e.g. multi-value candlestick/boxplot) a single axis is
 * returned using `fallbackFormatter`, preserving the pre-multi-axis behavior.
 * https://echarts.apache.org/en/option.html#yAxis
 */
export function buildCartesianYAxes(params: {
  fields: Field[];
  baseYAxis: YAXisOption;
  axisStyle: CartesianAxisOption | TimeAxisBaseOption;
  theme: GrafanaTheme2;
  timeZone?: string;
  fallbackFormatter: ValueFormatter;
  zlevel?: number;
  /**
   * Side that `Auto`-placed unit groups resolve to. Defaults to the core Grafana
   * rule (first unit left, the rest right). The heatmap overlay passes `right`
   * so its axes don't collide with the bucket axis pinned to the left.
   */
  autoSide?: Side;
  /**
   * Axes already occupying each side before these are laid out, so offsets and
   * grid spacing account for them. The heatmap passes `initialLeftCount: 1` for
   * its bucket axis, pushing any overlay left axis outboard of it.
   */
  initialLeftCount?: number;
  initialRightCount?: number;
}): CartesianYAxes {
  const {
    fields,
    baseYAxis,
    axisStyle,
    theme,
    timeZone,
    fallbackFormatter,
    zlevel,
    autoSide,
    initialLeftCount = 0,
    initialRightCount = 0,
  } = params;

  if (fields.length === 0) {
    const yAxis = mergeAxisStyle<YAXisOption>(baseYAxis, axisStyle, { zlevel }, fallbackFormatter);
    return { yAxis: [yAxis], seriesYAxisIndex: [], leftAxisCount: 1, rightAxisCount: 0 };
  }

  const { units, byUnit } = groupFieldsByUnit(fields);
  const unitAxisIndex = new Map(units.map((unit, index) => [unit, index]));

  let leftAxisCount = initialLeftCount;
  let rightAxisCount = initialRightCount;
  let splitLineAssigned = initialLeftCount > 0 || initialRightCount > 0;

  const yAxis = units.map((unit, groupIndex) => {
    const groupFields = byUnit.get(unit) ?? [];
    const placement = resolveGroupPlacement(groupFields);
    const hidden = placement === AxisPlacement.Hidden;

    let side: Side;
    if (placement === AxisPlacement.Left) {
      side = 'left';
    } else if (placement === AxisPlacement.Right) {
      side = 'right';
    } else {
      // Auto (and hidden): use the caller's override, else first unit left, the
      // rest right (core Grafana's dual-axis default).
      side = autoSide ?? (groupIndex === 0 ? 'left' : 'right');
    }

    // Only visible axes take up grid space / an offset slot.
    let offset = 0;
    if (!hidden) {
      if (side === 'left') {
        offset = leftAxisCount * AXIS_OFFSET_STEP;
        leftAxisCount++;
      } else {
        offset = rightAxisCount * AXIS_OFFSET_STEP;
        rightAxisCount++;
      }
    }

    const showSplitLine = !hidden && !splitLineAssigned;
    if (showSplitLine) {
      splitLineAssigned = true;
    }

    const formatter = getValueFormatter(groupFields[0], theme, timeZone);
    // Explicit standard-option Min/Max pin the axis; `scale: true` (from the base
    // axis) still auto-fits any side left unset. Read from the group's
    // representative field, as the formatter/placement above.
    const { min, max } = getFieldMinMax(groupFields[0]);
    const extras: CartesianAxisOption = {
      position: side,
      offset,
      zlevel,
      splitLine: { show: showSplitLine },
      min,
      max,
      ...(hidden
        ? {
            axisLabel: { show: false },
            axisTick: { show: false },
          }
        : {}),
    };

    return mergeAxisStyle<YAXisOption>(baseYAxis, axisStyle, extras, formatter);
  });

  const seriesYAxisIndex = fields.map((field) => {
    const unit = getFieldConfigFromField(field).unit ?? '';
    return unitAxisIndex.get(unit) ?? 0;
  });

  return { yAxis, seriesYAxisIndex, leftAxisCount, rightAxisCount };
}

/** Extra grid padding (px) needed for offset axes beyond the first on each side. */
export function getAxisGridSpacing(axes: Pick<CartesianYAxes, 'leftAxisCount' | 'rightAxisCount'>): {
  left: number;
  right: number;
} {
  return {
    left: Math.max(0, axes.leftAxisCount - 1) * AXIS_OFFSET_STEP,
    right: Math.max(0, axes.rightAxisCount - 1) * AXIS_OFFSET_STEP,
  };
}
