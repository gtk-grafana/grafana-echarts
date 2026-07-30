import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  CHORD_CLOCKWISE_DEFAULT,
  CHORD_LINK_OPACITY_DEFAULT,
  CHORD_MIN_ANGLE_DEFAULT,
  CHORD_PAD_ANGLE_DEFAULT,
  CHORD_START_ANGLE_DEFAULT,
  chordClockwisePath,
  chordLinkOpacityPath,
  chordMinAnglePath,
  chordPadAnglePath,
  chordStartAnglePath,
  isChordVariant,
} from 'editor/chord';
import { addAdvancedBooleanSwitch, addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Chord ring options, all Advanced. Every control gates on `isChordVariant`, so they
 * vanish for the graph and sankey variants.
 *
 * Unlike the sankey variant, chord gets no dedicated Default-tier category: its only
 * first-class control is the shared "Show node labels" switch, and everything else is
 * ring geometry that a reader rarely needs to touch. Every option omits its ECharts
 * key at its default.
 *
 * **No `nodeWidth` / `nodeGap` here.** `series.chord` has neither — they are sankey
 * keys. The angular `padAngle` is the gap analogue; ring thickness is
 * `series.chord.radius` (a two-element tuple), left at the ECharts default rather
 * than flattened into one control.
 *
 * https://echarts.apache.org/en/option.html#series-chord
 */
export function addRelationsChordOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedNumberInput(builder, {
    path: chordStartAnglePath,
    name: 'Start angle',
    description: 'Where the first arc begins, in degrees (90 = twelve o’clock)',
    defaultValue: CHORD_START_ANGLE_DEFAULT,
    showIf: isChordVariant,
    settings: { min: 0, max: 360, step: 5 },
  });

  addAdvancedBooleanSwitch(builder, {
    path: chordClockwisePath,
    name: 'Clockwise',
    description: 'Lay arcs out clockwise (off = counter-clockwise)',
    defaultValue: CHORD_CLOCKWISE_DEFAULT,
    showIf: isChordVariant,
  });

  addAdvancedNumberInput(builder, {
    path: chordPadAnglePath,
    name: 'Arc gap',
    description: 'Angular gap between adjacent node arcs, in degrees',
    defaultValue: CHORD_PAD_ANGLE_DEFAULT,
    showIf: isChordVariant,
    settings: { min: 0, max: 30, step: 0.5 },
  });

  addAdvancedNumberInput(builder, {
    path: chordMinAnglePath,
    name: 'Minimum arc angle',
    description: 'Smallest arc a node may occupy, so a low-flow node stays visible',
    defaultValue: CHORD_MIN_ANGLE_DEFAULT,
    showIf: isChordVariant,
    settings: { min: 0, max: 30, step: 0.5 },
  });

  addAdvancedNumberInput(builder, {
    path: chordLinkOpacityPath,
    name: 'Ribbon opacity',
    description: 'Translucency of the flow ribbons (0-1). Raise it on a sparse chord',
    defaultValue: CHORD_LINK_OPACITY_DEFAULT,
    showIf: isChordVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });
}
