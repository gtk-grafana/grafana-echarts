import { css } from '@emotion/css';
import { type GrafanaTheme2, type StandardEditorProps } from '@grafana/data';
import { Combobox, type ComboboxOption, Icon, Stack, Tooltip, useStyles2 } from '@grafana/ui';
import { isChordVariant } from 'editor/chord';
import { isSankeyVariant } from 'editor/sankey';
import { type RelationsLinkColor } from 'editor/types';
import { RELATIONS_LINK_COLOR_DEFAULT } from 'lib/echarts/options/graph';
import React from 'react';
import { type PanelOptions } from 'types';

/**
 * The precedence the control cannot show, carried by an info icon rather than by the
 * option's `description`.
 *
 * A `description` is **always** rendered — `OptionsPaneItemDescriptor` passes it to
 * `<Field description>` and to the option's `<Label>`, both of which draw it as standing
 * help text under the label — so a caveat this long sits permanently under a control that
 * is usually doing exactly what it says. Behind an icon it is there when wanted and
 * silent otherwise.
 *
 * It has to be said *somewhere*, because nothing about the control reveals it: an edge
 * whose own field carries a colour uses that instead, and a by-value scheme is such a
 * colour (`isPaletteColorMode`). Hiding the control in that case is not available —
 * `PanelOptionsEditorItem.showIf` is handed the panel options and the frames, never
 * `fieldConfig` — and would be wrong anyway, since a field override can put one edge
 * under a by-value scheme while the rest of the panel follows this option.
 */
export const LINK_COLOR_PRECEDENCE_HELP =
  'Ignored where the link’s own field colors it: a single/fixed color, or a by-value scheme such as thresholds';

/** The two endpoint keywords, offered by every variant. */
const endpointColorOptions: Array<ComboboxOption<RelationsLinkColor>> = [
  { value: 'source', label: 'Source' },
  { value: 'target', label: 'Target' },
];

/** Where a source-to-target blend is really drawn. See {@link blendsGradient}. */
const linkColorOptions: Array<ComboboxOption<RelationsLinkColor>> = [
  ...endpointColorOptions,
  { value: 'gradient', label: 'Gradient' },
];

/**
 * Where it is not. The entry stays in the list, relabelled with what the panel actually
 * draws, rather than being dropped: `gradient` is the family default
 * (`RELATIONS_LINK_COLOR_DEFAULT`) and a panel-option default is persisted into every
 * panel's JSON, so a list without it would leave the picker resolving a stored value it
 * does not offer — every chord panel would open showing a bare lowercase "gradient". A
 * per-variant default cannot fix that either: one path carries one default.
 */
const degradedLinkColorOptions: Array<ComboboxOption<RelationsLinkColor>> = [
  ...endpointColorOptions,
  { value: 'gradient', label: 'Gradient (draws as Source here)' },
];

/**
 * Does the panel, as currently configured, actually **blend** a gradient — or silently
 * draw the source node's colour instead?
 *
 * - **sankey**: always. `SankeyView` implements all three keywords itself.
 * - **chord**: never. `getChordLinkStyle` maps the keyword to `'source'` unconditionally,
 *   because a chord ribbon is a wide filled area whose bulk lies off the blend axis and
 *   washes out at ECharts' 0.2 ribbon opacity.
 * - **graph**: only under `layout: 'none'`, the one layout whose node positions are known
 *   before ECharts lays the graph out. zrender resolves a non-global gradient against the
 *   shape's bounding box, so an unoriented blend would run source-to-target only for the
 *   edges whose source happens to sit on the left — see `makeEdgeGradientResolver`. An
 *   *absent* layout counts, since data that pins every node infers `none`
 *   (`getGraphLayout`).
 *
 * Read off the panel options rather than the resolved layout, which is all an editor can
 * see: a graph with `Layout` left unset and unpinned data resolves to `force` and still
 * gets the plain label. That direction is the safe one — it never hides a blend that does
 * happen.
 */
export function blendsGradient(options: Partial<PanelOptions> = {}): boolean {
  if (isChordVariant(options)) {
    return false;
  }
  if (isSankeyVariant(options)) {
    return true;
  }
  return options.relationsLayout == null || options.relationsLayout === 'none';
}

/** The choices to offer for the panel as currently configured. */
export function linkColorChoices(options: Partial<PanelOptions> = {}): Array<ComboboxOption<RelationsLinkColor>> {
  return blendsGradient(options) ? linkColorOptions : degradedLinkColorOptions;
}

/**
 * The "Link color" picker.
 *
 * A local component rather than the standard `select` editor id for two reasons, both of
 * which the standard editor cannot do:
 *
 * - the **choice list is contextual** (see {@link linkColorChoices}), and this is the only
 *   place it can be. `settings.getOptions` looks like the way and is a trap:
 *   `SelectValueEditor` re-runs it only when `context.data` changes, so the list would
 *   still read "Gradient" after a switch to Circular. A component re-renders whenever the
 *   panel options do, since the whole pane is rebuilt from them
 *   (`getVisualizationOptions2`).
 * - the **caveat is an icon**, not standing help text. See
 *   {@link LINK_COLOR_PRECEDENCE_HELP}.
 */
export const RelationsLinkColorEditor: React.FC<
  StandardEditorProps<RelationsLinkColor, unknown, PanelOptions>
> = ({ value, onChange, context, id }) => {
  const styles = useStyles2(getStyles);
  const choices = linkColorChoices(context.options);

  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <div className={styles.picker}>
        <Combobox<RelationsLinkColor>
          id={id}
          value={value ?? RELATIONS_LINK_COLOR_DEFAULT}
          options={choices}
          onChange={(selected) => onChange(selected.value)}
        />
      </div>
      {/*
        The glyph is wrapped rather than annotated directly: `Icon` renders through
        `react-inlinesvg`, which owns the `<svg>` and drops anything it is handed, so the
        accessible name and the tab stop have to live on an element of our own. Focusable
        so the caveat is not mouse-only.
      */}
      <Tooltip content={LINK_COLOR_PRECEDENCE_HELP} placement="top" interactive>
        <span className={styles.help} tabIndex={0} role="img" aria-label={LINK_COLOR_PRECEDENCE_HELP}>
          <Icon name="info-circle" size="sm" />
        </span>
      </Tooltip>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // The picker takes the row; `minWidth: 0` so the flex item may shrink below the
  // control's own content width rather than pushing the icon out of the pane.
  picker: css({
    flex: 1,
    minWidth: 0,
  }),
  help: css({
    display: 'inline-flex',
    color: theme.colors.text.secondary,
    cursor: 'help',
  }),
});
