import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { addAdvancedBooleanSwitch, addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

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
  chordCategoryName,
} from 'editor/relations/chord';
import { isChordVariant } from 'editor/relations/variants';
/**
 * Chord ring options, in their own "Chord" section.
 * https://echarts.apache.org/en/option.html#series-chord
 */
const chordCategory = [chordCategoryName];

export function addRelationsChordOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedNumberInput(builder, {
    path: chordStartAnglePath,
    name: 'Start angle',
    description: 'Where the first arc begins, in degrees (90 = twelve o’clock)',
    defaultValue: CHORD_START_ANGLE_DEFAULT,
    category: chordCategory,
    showIf: isChordVariant,
    settings: { min: 0, max: 360, step: 5 },
  });

  addAdvancedBooleanSwitch(builder, {
    path: chordClockwisePath,
    name: 'Clockwise',
    description: 'Lay arcs out clockwise (off = counter-clockwise)',
    defaultValue: CHORD_CLOCKWISE_DEFAULT,
    category: chordCategory,
    showIf: isChordVariant,
  });

  addAdvancedNumberInput(builder, {
    path: chordPadAnglePath,
    name: 'Arc gap',
    description: 'Angular gap between adjacent node arcs, in degrees',
    defaultValue: CHORD_PAD_ANGLE_DEFAULT,
    category: chordCategory,
    showIf: isChordVariant,
    settings: { min: 0, max: 30, step: 0.5 },
  });

  addAdvancedNumberInput(builder, {
    path: chordMinAnglePath,
    name: 'Minimum arc angle',
    description: 'Smallest arc a node may occupy, so a low-flow node stays visible',
    defaultValue: CHORD_MIN_ANGLE_DEFAULT,
    category: chordCategory,
    showIf: isChordVariant,
    settings: { min: 0, max: 30, step: 0.5 },
  });

  addAdvancedNumberInput(builder, {
    path: chordLinkOpacityPath,
    name: 'Ribbon opacity',
    description: 'Translucency of the flow ribbons (0-1). Raise it on a sparse chord',
    defaultValue: CHORD_LINK_OPACITY_DEFAULT,
    category: chordCategory,
    showIf: isChordVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });
}
