import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';

import {
  addAdvancedBooleanSwitch,
  addAdvancedColorPicker,
  addAdvancedNumberInput,
  addAdvancedRadio,
  addAdvancedSelect,
  addAdvancedTextInput,
} from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['number', 'select', 'radio', 'boolean', 'text', 'color'].map((id) => ({ id, name: id, editor: noEditor }))
);

const registeredOptions = () => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();

  addAdvancedNumberInput(builder, {
    path: 'advancedNumber',
    name: 'Number',
    description: 'Number description',
    category: ['Layout'],
    defaultValue: 1,
    settings: { min: 0 },
    showIf: (options) => options.seriesType === 'graph',
  });
  addAdvancedSelect(builder, {
    path: 'advancedSelect',
    name: 'Select',
    description: 'Select description',
    defaultValue: 'one',
    settings: { options: [{ label: 'One', value: 'one' }] },
  });
  addAdvancedRadio(builder, {
    path: 'advancedRadio',
    name: 'Radio',
    description: 'Radio description',
    defaultValue: 'one',
    settings: { options: [{ label: 'One', value: 'one' }] },
  });
  addAdvancedBooleanSwitch(builder, {
    path: 'advancedBoolean',
    name: 'Boolean',
    description: 'Boolean description',
    defaultValue: false,
  });
  addAdvancedTextInput(builder, {
    path: 'advancedText',
    name: 'Text',
    description: 'Text description',
    defaultValue: 'value',
  });
  addAdvancedColorPicker(builder, {
    path: 'advancedColor',
    name: 'Color',
    description: 'Color description',
    defaultValue: 'red',
  });

  return builder.getItems();
};

describe('Advanced option builders', () => {
  it('prefixes each option description once', () => {
    expect(registeredOptions().map(({ description }) => description)).toEqual([
      'Advanced. Number description',
      'Advanced. Select description',
      'Advanced. Radio description',
      'Advanced. Boolean description',
      'Advanced. Text description',
      'Advanced. Color description',
    ]);
  });

  it('preserves a purpose category and defaults other options to Advanced', () => {
    expect(registeredOptions().map(({ category }) => category)).toEqual([
      ['Layout'],
      ['Advanced'],
      ['Advanced'],
      ['Advanced'],
      ['Advanced'],
      ['Advanced'],
    ]);
  });

  it('combines the Advanced gate with an extra visibility predicate', () => {
    const item = registeredOptions()[0];

    expect(item.showIf?.({ editorMode: 'default', seriesType: 'graph' } as PanelOptions)).toBe(false);
    expect(item.showIf?.({ editorMode: 'advanced', seriesType: 'graph' } as PanelOptions)).toBe(true);
    expect(item.showIf?.({ editorMode: 'advanced', seriesType: 'sankey' } as PanelOptions)).toBe(false);
  });
});
