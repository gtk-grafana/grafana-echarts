import { type StandardEditorProps } from '@grafana/data';
import { StatsPicker } from '@grafana/ui';
import React, { useCallback } from 'react';

/** A mark has exactly two stat slots: a main stat and a secondary. */
export const RELATIONS_MAX_CALCS = 2;

/**
 * The "Calculation" picker for the relations family: Grafana's multi-select
 * `StatsPicker`, **clamped to two selections**.
 *
 * The stock `stats-picker` editor has no maximum, so the control accepted any number of
 * reducers while only the first two could mean anything — a mark has one main stat slot
 * and one secondary slot, and `normalizeRelationsCalcs` dropped the rest silently. A
 * control that takes input it then discards is the kind of thing a user reasonably reads
 * as broken, so the clamp is here, where it is visible, rather than downstream.
 *
 * Clamping on change rather than filtering the option list: the reducer list is the same
 * whichever slot is being filled, so there is nothing to filter — what is limited is how
 * many may be chosen. `normalizeRelationsCalcs` still truncates, for dashboards saved
 * before this and for the API editor mode, which writes options as raw JSON.
 */
export const StatsPickerPair: React.FC<StandardEditorProps<string[]>> = ({ value, onChange }) => {
  const onStatsChange = useCallback(
    (next: string[]) => {
      // Keep the *last* two rather than the first: adding a third then reads as
      // replacing the secondary, where dropping the extra would look like nothing
      // happened at all.
      onChange(next.length > RELATIONS_MAX_CALCS ? next.slice(-RELATIONS_MAX_CALCS) : next);
    },
    [onChange]
  );

  return <StatsPicker stats={value ?? []} onChange={onStatsChange} allowMultiple width="auto" />;
};
