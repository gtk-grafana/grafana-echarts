import { type FieldReducerInfo, type StandardEditorProps } from '@grafana/data';
import { StatsPicker } from '@grafana/ui';
import React from 'react';

/**
 * Reducers a relations mark cannot be built from, filtered out of the picker rather
 * than offered and silently mishandled.
 *
 * `calcs[0]` has to be **one number**: it sizes a node, colours it and weighs an edge or
 * a ribbon. These four do not return one.
 *
 * - `allValues` returns the whole array and `uniqueValues` the distinct set, so a mark
 *   would have no single value to draw. Picking either currently yields a node with no
 *   size and no stat row rather than an error.
 * - `allIsNull` and `allIsZero` return a **boolean**, which a geometry reads as 1 or 0 —
 *   so every node in a healthy graph collapses to nothing.
 *
 * `distinctCount` and `changeCount` are deliberately **not** here: both return a count,
 * which is a perfectly good number to size a node by.
 */
const NON_SCALAR_REDUCERS = new Set(['allValues', 'uniqueValues', 'allIsNull', 'allIsZero']);

/** Keep every reducer whose result is a single number. */
const isScalarReducer = (reducer: FieldReducerInfo) => !NON_SCALAR_REDUCERS.has(reducer.id);

/**
 * The "Calculation" picker for the relations family: Grafana's multi-select `StatsPicker`,
 * with **no maximum** and non-scalar reducers filtered out.
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
 * through it would make this option's editor unresolvable under test — and it is also what
 * makes `filterOptions` reachable at all.
 */
export const RelationsStatsPicker: React.FC<StandardEditorProps<string[]>> = ({ value, onChange }) => (
  <StatsPicker stats={value ?? []} onChange={onChange} allowMultiple width="auto" filterOptions={isScalarReducer} />
);
