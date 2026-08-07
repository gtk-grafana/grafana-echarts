import { type StandardEditorProps } from '@grafana/data';
import { StatsPicker } from '@grafana/ui';
import React from 'react';

/**
 * The "Calculation" picker for the relations family: Grafana's multi-select `StatsPicker`,
 * with **no maximum**.
 *
 * It was clamped to two, on the reasoning that a mark has one main stat slot and one
 * secondary. Only the first half of that is true: `calcs[0]` is the number that sizes a node,
 * colours it and weighs an edge, so it is structurally singular — but every calculation after
 * it is a tooltip row and nothing else, and the tooltip has as many rows as it needs. So the
 * cap is gone and the reader emits one row per reducer (`secondaryStatsOf`).
 *
 * The clamp also misbehaved on its own terms: it kept the *last* two, so adding a third
 * reducer to `[max, min]` produced `[min, mean]` — silently promoting `min` to the main stat
 * and changing the node sizes and colours the panel drew.
 *
 * A local component rather than the standard `stats-picker` editor id, because
 * `standardEditorsRegistry` is filled by Grafana core app code a plugin cannot import; going
 * through it would make this option's editor unresolvable under test.
 */
export const RelationsStatsPicker: React.FC<StandardEditorProps<string[]>> = ({ value, onChange }) => (
  <StatsPicker stats={value ?? []} onChange={onChange} allowMultiple width="auto" />
);
