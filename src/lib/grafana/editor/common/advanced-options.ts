import {
  type NumberFieldConfigSettings,
  type PanelOptionsEditorBuilder,
  type SelectFieldConfigSettings,
  type StringFieldConfigSettings,
} from '@grafana/data';
import { advancedOptionsCategoryName } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Shared helpers for Advanced-gated editor options, used by the part-to-whole
 * (pie) editor and by the cartesian performance options. Every advanced option
 * follows the same shape: it lives in the single `advancedOptionsCategoryName`
 * ("Advanced") category and is hidden unless the panel is in Advanced editor mode.
 * These helpers capture that shape so each editor file is a single declarative
 * call instead of repeating `category` + `showIf: isAdvancedEditorMode` (and
 * hand-composing the gate with any extra condition).
 *
 * The tier and the **section** are two different questions, so `category` is an
 * optional override rather than baked in. It defaults to the shared "Advanced"
 * section, which is what every family except relations wants: one clearly-labelled
 * extra section. Relations groups by purpose instead (Labels, Layout, Interaction,
 * Edges, Sankey, Chord) and carries the tier only through the `showIf` gate, so an
 * Advanced control sits beside the Default-tier controls it belongs with rather
 * than in a bucket of unrelated knobs.
 */

/** Default section for an advanced option when the caller names none. */
const advancedCategory = [advancedOptionsCategoryName];

/** Extra visibility predicate composed on top of the Advanced-mode gate. */
export type ExtraShowIf = (options: PanelOptions) => boolean | undefined;

/**
 * Compose the Advanced-mode gate with an optional extra predicate: the option is
 * shown only in Advanced mode and, when `extra` is given, only when it also holds
 * (e.g. reveal "Label width" once an overflow mode is chosen). Pass the result as
 * an option's `showIf`.
 */
export function showIfAdvanced(extra?: ExtraShowIf): ExtraShowIf {
  return (options) => isAdvancedEditorMode(options) && (extra?.(options) ?? true);
}

/**
 * AND-compose several optional visibility predicates into one (treating a missing
 * or `undefined` result as "shown"), or return `undefined` when none are given so
 * callers can pass it straight through. Combines a family-variant gate (e.g.
 * `isPieVariant`) passed down from the module with a control's own dependency
 * predicate (e.g. "an overflow mode is chosen").
 */
export function composeShowIf(...predicates: Array<ExtraShowIf | undefined>): ExtraShowIf | undefined {
  const defined = predicates.filter((predicate): predicate is ExtraShowIf => predicate != null);
  if (defined.length === 0) {
    return undefined;
  }
  return (options) => defined.every((predicate) => predicate(options) ?? true);
}

/** Fields shared by every advanced-option spec. */
interface AdvancedSpecBase<TValue> {
  path: string;
  name: string;
  description?: string;
  defaultValue?: TValue;
  /**
   * Section to register under. Defaults to the shared "Advanced" category; pass one
   * to keep an Advanced-gated control in a purpose-named section instead.
   */
  category?: string[];
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

interface AdvancedTextSpec extends AdvancedSpecBase<string> {
  settings?: StringFieldConfigSettings;
}

/** Advanced-gated number input (ECharts numeric option). */
export function addAdvancedNumberInput(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { showIf, category, ...rest }: AdvancedNumberSpec
): void {
  builder.addNumberInput({ ...rest, category: category ?? advancedCategory, showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated select (single choice from a fixed option list). */
export function addAdvancedSelect<TOption>(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { showIf, category, ...rest }: AdvancedSelectSpec<TOption>
): void {
  builder.addSelect({ ...rest, category: category ?? advancedCategory, showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated radio (single choice rendered as buttons). */
export function addAdvancedRadio<TOption>(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { showIf, category, ...rest }: AdvancedSelectSpec<TOption>
): void {
  builder.addRadio({ ...rest, category: category ?? advancedCategory, showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated boolean switch (on/off ECharts toggle). */
export function addAdvancedBooleanSwitch(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { showIf, category, ...rest }: AdvancedBooleanSpec
): void {
  builder.addBooleanSwitch({ ...rest, category: category ?? advancedCategory, showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated text input (a free-form string, e.g. a datasource label key). */
export function addAdvancedTextInput(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { showIf, category, ...rest }: AdvancedTextSpec
): void {
  builder.addTextInput({ ...rest, category: category ?? advancedCategory, showIf: showIfAdvanced(showIf) });
}

/** Advanced-gated color picker (hex or theme token). */
export function addAdvancedColorPicker(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { showIf, category, ...rest }: AdvancedColorSpec
): void {
  builder.addColorPicker({ ...rest, category: category ?? advancedCategory, showIf: showIfAdvanced(showIf) });
}
