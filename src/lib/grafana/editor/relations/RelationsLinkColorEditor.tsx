import { css } from '@emotion/css';
import { type GrafanaTheme2, type StandardEditorProps } from '@grafana/data';
import { Combobox, type ComboboxOption, Icon, Stack, Tooltip, useStyles2 } from '@grafana/ui';

import React from 'react';
import { type PanelOptions } from 'types';

import { RELATIONS_LINK_COLOR_DEFAULT } from 'editor/relations/constants';
import { isChordVariant, isSankeyVariant } from 'editor/relations/variants';
import { type RelationsLinkColor } from 'editor/relations/types';
/** Help text for per-field color precedence. */
export const LINK_COLOR_PRECEDENCE_HELP =
  'Ignored where the link’s own field colors it: a single/fixed color, or a by-value scheme such as thresholds. Gradient is only supported with Sankey';

/** The two endpoint keywords, offered by every variant. */
const endpointColorOptions: Array<ComboboxOption<RelationsLinkColor>> = [
  { value: 'source', label: 'Source' },
  { value: 'target', label: 'Target' },
];

/** Check whether the variant draws a source-to-target blend. */
const linkColorOptions: Array<ComboboxOption<RelationsLinkColor>> = [
  ...endpointColorOptions,
  { value: 'gradient', label: 'Gradient' },
];

/** Check whether the variant uses a gradient fallback. */
const degradedLinkColorOptions: Array<ComboboxOption<RelationsLinkColor>> = [
  ...endpointColorOptions,
  { value: 'gradient', label: 'Gradient (draws as "Source")' },
];

/** Does the panel, as currently configured, actually blend a gradient. */
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

/** The "Link color" picker. */
export const RelationsLinkColorEditor: React.FC<StandardEditorProps<RelationsLinkColor, unknown, PanelOptions>> = ({
  value,
  onChange,
  context,
  id,
}) => {
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
      <Tooltip content={LINK_COLOR_PRECEDENCE_HELP} placement="top" interactive>
        <span className={styles.help}>
          <Icon name="info-circle" size="sm" />
        </span>
      </Tooltip>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // Allow the picker to shrink without hiding the help icon.
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
