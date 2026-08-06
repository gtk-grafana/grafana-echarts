import {
  applyFieldOverrides,
  createTheme,
  type DataFrame,
  FieldColorModeId,
  FieldConfigOptionsRegistry,
  type FieldConfigSource,
  identityOverrideProcessor,
} from '@grafana/data';

/**
 * Running Grafana's real pre-panel field-config pass under jest.
 *
 * `applyFieldOverrides` resolves every override property through
 * `standardFieldConfigEditorRegistry`, which Grafana core fills from app code plugins
 * cannot import (`public/app/core/components/OptionsUI/registry.tsx`). Under jest that
 * registry is empty, so `setDynamicConfigValue` returns on its first line and **every
 * override is silently dropped** — a test asserting "a byName override recolours this"
 * would pass against a render that ignored it. Passing a registry explicitly is the
 * supported way in.
 */

/** No option editor renders here; the registry is consulted for `process` only. */
const noEditor = (): null => null;

/**
 * The field-config properties `applyFieldOverrides` is allowed to apply in tests,
 * mirroring core's own entries.
 *
 * Only `color` — the one property whose resolution the panel genuinely delegates
 * upstream, now that the relations family reads `field.display(value).color` rather
 * than re-deriving colour from `fieldConfig`. Deliberately not the whole standard set:
 * each entry added here also starts applying `fieldConfig.defaults`, which changes what
 * every family's snapshots render from.
 */
export const testFieldConfigRegistry = new FieldConfigOptionsRegistry(() => [
  {
    id: 'color',
    path: 'color',
    name: 'Color scheme',
    editor: noEditor,
    override: noEditor,
    process: identityOverrideProcessor,
    shouldApply: () => true,
  },
]);

const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

/**
 * Frames as the panel receives them: palette-classic pinned on every field (what the
 * panel's own registered default does in the host), then `fieldConfig` applied through
 * the registry above.
 */
export const applyTestFieldConfig = (
  frames: DataFrame[],
  fieldConfig: FieldConfigSource = emptyFieldConfig,
  theme = createTheme()
): DataFrame[] =>
  applyFieldOverrides({
    data: frames.map((frame) => ({
      ...frame,
      fields: frame.fields.map((field) => ({
        ...field,
        config: {
          ...field.config,
          color: field.config.color ?? { mode: FieldColorModeId.PaletteClassic },
        },
      })),
    })),
    fieldConfig,
    fieldConfigRegistry: testFieldConfigRegistry,
    replaceVariables: (value) => value,
    theme,
    timeZone: 'utc',
  });
