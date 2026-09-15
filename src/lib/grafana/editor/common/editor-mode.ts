import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { EDITOR_MODE_DEFAULT, editorModeName, editorModeOptions, editorModePath } from 'editor/constants';
import { type EditorMode } from 'editor/types';
import { type PanelOptions } from 'types';

/**
 * Shared editor-mode helpers. The editor mode tiers the panel editor surface so
 * parity-critical options stay visible by default while ECharts-only extras are
 * gated behind Advanced. `'api'` is a JSON-only tier (never in the UI). See
 * `docs/options-modes.md`.
 */

/** Resolve the effective editor mode, defaulting unset panels to Default. */
export function resolveEditorMode(options: Pick<PanelOptions, 'editorMode'>): EditorMode {
  return options.editorMode ?? EDITOR_MODE_DEFAULT;
}

/**
 * Whether advanced-only options should be shown. Pass as an option's `showIf` to
 * gate it behind Advanced: `showIf: isAdvancedEditorMode`.
 */
export function isAdvancedEditorMode(options: Pick<PanelOptions, 'editorMode'>): boolean {
  return resolveEditorMode(options) === 'advanced';
}

/** Whether the (JSON-only) API tier is selected. Exported for future use. */
export function isApiEditorMode(options: Pick<PanelOptions, 'editorMode'>): boolean {
  return resolveEditorMode(options) === 'api';
}

/**
 * Register the shared "Editor mode" radio (Default / Advanced). `'api'` is intentionally
 * not offered in the UI — it's settable only via dashboard JSON; `RadioButtonGroup`
 * simply shows no active button for it, which is harmless. Follows `addPieTypeOptions`
 * (plain string labels, no explicit generic).
 *
 * `category` is optional. Passing none leaves the option uncategorised, which Grafana
 * renders under a section **named after the panel plugin** — so a relations panel grew a
 * section called "ECharts Relations" holding one radio, next to its actual "Relations"
 * section. A family with somewhere better to put it passes that section and registers
 * this last, so the switch sits at the foot of a real group rather than in a section of
 * its own.
 */
export function addEditorModeOption(builder: PanelOptionsEditorBuilder<PanelOptions>, category?: string[]) {
  builder.addRadio({
    path: editorModePath,
    name: editorModeName,
    // Says what Advanced *costs*, not just what it adds. The previous wording — "Default
    // shows critical, core-parity options; Advanced adds ECharts-only features" — was
    // wrong twice over: Default carries plenty that has no core equivalent (the sankey
    // and chord layout controls), and it framed the extra options as merely additional
    // when the honest warning is that they are experimental.
    description: 'Default shows core options. Advanced adds experimental features, which may not work as expected',
    defaultValue: EDITOR_MODE_DEFAULT,
    settings: {
      options: editorModeOptions,
    },
    ...(category ? { category } : {}),
  });
}
