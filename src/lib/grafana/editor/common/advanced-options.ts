import {
  type NumberFieldConfigSettings,
  type PanelOptionsEditorBuilder,
  type SelectFieldConfigSettings,
} from '@grafana/data';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Shared helpers for the Advanced-gated pie editor options. Every advanced option
 * follows the same shape: it lives in one plugin-owned category and is hidden
 * unless the panel is in Advanced editor mode. These helpers capture that shape so
 * each editor file is a single declarative call instead of repeating
 * `category: [X]` + `showIf: isAdvancedEditorMode` (and hand-composing the gate
 * with any extra condition).
 */

/** Extra visibility predicate composed on top of the Advanced-mode gate. */
type ExtraShowIf = (options: PanelOptions) => boolean | undefined;

/**
 * Compose the Advanced-mode gate with an optional extra predicate: the option is
 * shown only in Advanced mode and, when `extra` is given, only when it also holds
 * (e.g. reveal "Label width" once an overflow mode is chosen). Pass the result as
 * an option's `showIf`.
 */
export function showIfAdvanced(extra?: ExtraShowIf): ExtraShowIf {
  return (options) => isAdvancedEditorMode(options) && (extra?.(options) ?? true);
}

/** Fields shared by every advanced-option spec. `category` is a single name (wrapped for the builder). */
interface AdvancedSpecBase<TValue> {
  path: string;
  name: string;
  category: string;
  description?: string;
  defaultValue?: TValue;
  /** Extra condition beyond Advanced mode; composed via `showIfAdvanced`. */
  showIf?: ExtraShowIf;
}

interface AdvancedNumberSpec extends AdvancedSpecBase<number> {
  settings?: NumberFieldConfigSettings;
}

interface AdvancedSelectSpec<TOption> extends AdvancedSpecBase<TOption> {
  settings: SelectFieldConfigSettings<TOption>;
}

type AdvancedBooleanSpec = AdvancedSpecBase<boolean>;
type AdvancedColorSpec = AdvancedSpecBase<string>;

/** Advanced-gated number input (ECharts numeric option). */
export function addAdvancedNumberInput(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { category, showIf, ...rest }: AdvancedNumberSpec
): void {
  builder.addNumberInput({ ...rest, category: [category], showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated select (single choice from a fixed option list). */
export function addAdvancedSelect<TOption>(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { category, showIf, ...rest }: AdvancedSelectSpec<TOption>
): void {
  builder.addSelect({ ...rest, category: [category], showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated radio (single choice rendered as buttons). */
export function addAdvancedRadio<TOption>(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { category, showIf, ...rest }: AdvancedSelectSpec<TOption>
): void {
  builder.addRadio({ ...rest, category: [category], showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated boolean switch (on/off ECharts toggle). */
export function addAdvancedBooleanSwitch(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { category, showIf, ...rest }: AdvancedBooleanSpec
): void {
  builder.addBooleanSwitch({ ...rest, category: [category], showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated color picker (hex or theme token). */
export function addAdvancedColorPicker(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { category, showIf, ...rest }: AdvancedColorSpec
): void {
  builder.addColorPicker({ ...rest, category: [category], showIf: showIfAdvanced(showIf) });
}
