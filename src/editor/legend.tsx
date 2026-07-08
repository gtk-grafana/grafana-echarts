import { type PanelOptionsEditorBuilder, type StandardEditorProps } from '@grafana/data';
import { commonOptionsBuilder, Input } from '@grafana/ui';
import React, { type ChangeEvent } from 'react';
import { type PanelOptions } from 'types';

// grafana/grafana#126198 widened the Core "Width" legend option to
// `number | string` and its editor emits CSS strings (e.g. `"35%"`, `"220px"`).
// This panel sizes the legend and the ECharts canvas in pixels and cannot
// measure a CSS width, so we keep width numeric: after registering the standard
// legend options we swap the width editor for a pixel-only number input and
// correct the placeholder so it no longer advertises px/% inputs.

const LEGEND_WIDTH_EDITOR_ID = 'legend.width';

/** Numeric, pixel-only replacement for Core's `number | string` width editor. */
const LegendWidthEditor = ({ value, onChange }: StandardEditorProps<number | undefined>) => (
  <Input
    type="number"
    min={0}
    suffix="px"
    placeholder="Auto"
    value={value ?? ''}
    onChange={(e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.currentTarget.value.trim();
      const next = raw === '' ? NaN : Number(raw);
      onChange(Number.isFinite(next) ? next : undefined);
    }}
    // Mirrors Core's workaround for an ancestor that remounts on each keypress.
    onInputCapture={(e) => e.stopPropagation()}
  />
);

/**
 * Register Core's standard "Legend" options, but with a numeric (pixel-only)
 * width editor instead of Core's CSS `number | string` width editor. See
 * `PanelLegendOptions` in `types.ts`, which narrows `width` to a number.
 */
export function addLegendOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  commonOptionsBuilder.addLegendOptions(builder);

  // The builder exposes its live item list; replace the width editor in place
  // (re-adding the same path would throw a duplicate-key error in the registry).
  const widthItem = builder.getItems().find((item) => item.id === LEGEND_WIDTH_EDITOR_ID);
  if (widthItem) {
    widthItem.editor = LegendWidthEditor as typeof widthItem.editor;
  }
}
