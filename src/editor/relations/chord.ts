import { type SeriesType } from 'editor/types';

/**
 * Chord uses the relations model and accepts cycles.
 * ECharts chord options: https://echarts.apache.org/en/option.html#series-chord
 */
export const chordSeriesTypes: SeriesType[] = ['chord'];

/** Editor section for chord layout controls. */
export const chordCategoryName = 'Chord';

export const chordStartAnglePath = 'relationsChordStartAngle';
export const CHORD_START_ANGLE_DEFAULT = 90;

export const chordClockwisePath = 'relationsChordClockwise';
export const CHORD_CLOCKWISE_DEFAULT = true;

/** Chord uses an angular gap instead of sankey node gap values. */
export const chordPadAnglePath = 'relationsChordPadAngle';
export const CHORD_PAD_ANGLE_DEFAULT = 3;

export const chordMinAnglePath = 'relationsChordMinAngle';
export const CHORD_MIN_ANGLE_DEFAULT = 0;

export const chordLinkOpacityPath = 'relationsChordLinkOpacity';
export const CHORD_LINK_OPACITY_DEFAULT = 0.2;
