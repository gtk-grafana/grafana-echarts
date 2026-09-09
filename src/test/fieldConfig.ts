import {
  applyFieldOverrides,
  createTheme,
  type DataFrame,
  FieldColorModeId,
  FieldConfigOptionsRegistry,
  type FieldConfigPropertyItem,
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
 *
 * The properties below are therefore restated rather than taken from the modules'
 * own `useCustomConfig`, which would be the drift-proof version. The same empty-registry
 * problem blocks it one level down: `FieldConfigEditorBuilder.addNumberInput` and
 * friends look their editor component up in `standardEditorsRegistry` at registration
 * time, so replaying a real registration under jest throws `"number" not found`.
 * Only `addCustomEditor`, which brings its own component, survives.
 */

/** No option editor renders here; the registry is consulted for `process` only. */
const noEditor = (): null => null;

/** Everything `applyFieldOverrides` needs of a property; the editor half is inert. */
const item = (id: string, name: string, path = id): FieldConfigPropertyItem => ({
  id,
  path,
  name,
  editor: noEditor,
  override: noEditor,
  process: identityOverrideProcessor,
  shouldApply: () => true,
});

/**
 * A plugin-registered `custom.*` property. Keyed by the prefixed id — that is what an
 * override's `DynamicConfigValue.id` carries — but written to `config.custom` at the
 * unprefixed path, which is the split `createFieldConfigRegistry` makes in the host.
 */
const customItem = (path: string, name: string): FieldConfigPropertyItem => ({
  ...item(`custom.${path}`, name, path),
  isCustom: true,
});

/**
 * The properties tests are allowed to override.
 *
 * `color` is the one standard property the panel delegates upstream rather than
 * re-deriving — the relations family reads it back as `field.display(value).color`.
 * Deliberately not the rest of the standard set: each entry also starts applying
 * `fieldConfig.defaults`, which would change what every family's snapshots render from.
 *
 * The `custom.*` entries are the relations family's per-mark config
 * (`editor/relations/fieldConfig.ts`), which it reads straight off each mark. They are
 * registered for every family because a registry is per-`applyFieldOverrides` call, not
 * per-panel; that is harmless, since a family only ever reads the properties it
 * registered itself.
 */
export const testFieldConfigRegistry = new FieldConfigOptionsRegistry(() => [
  item('color', 'Color scheme'),
  customItem('hideFrom', 'Hide in area'),
  customItem('nodeRadius', 'Node radius'),
  customItem('subtitle', 'Subtitle'),
  customItem('fixedX', 'Fixed x'),
  customItem('fixedY', 'Fixed y'),
  customItem('lineWidth', 'Line width'),
  customItem('lineType', 'Line type'),
  customItem('curveness', 'Curveness'),
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
