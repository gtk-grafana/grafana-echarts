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
 * Register the shared "Editor mode" radio (Default / Advanced) at the top of the
 * editor (no category). `'api'` is intentionally not offered in the UI — it's
 * settable only via dashboard JSON; `RadioButtonGroup` simply shows no active
 * button for it, which is harmless. Follows `addPieTypeOptions` (plain string
 * labels, no explicit generic).
 */
export function addEditorModeOption(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: editorModePath,
    name: editorModeName,
    description: 'Default shows critical, core-parity options; Advanced adds ECharts-only features',
    defaultValue: EDITOR_MODE_DEFAULT,
    settings: {
      options: editorModeOptions,
    },
  });
}
