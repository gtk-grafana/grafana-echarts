import {
  escapeStringForRegex,
  type FieldOverrideContext,
  getFieldDisplayName,
  type PanelOptionsEditorBuilder,
  type ReduceDataOptions,
  ReducerID,
  standardEditorsRegistry,
} from '@grafana/data';
import { t } from '@grafana/i18n';

// @todo currently copied from grafana/grafana/public/app/plugins/panel/stat/common.ts - needs externalization
//
// The generic is relaxed from Grafana's `SingleStatBaseOptions` to just the
// `reduceOptions` slice this touches, so any panel options type carrying
// `reduceOptions` can reuse it (the pie needs none of stat's `orientation` /
// text-formatting fields). `defaultCalc` lets callers choose the default reducer:
// Grafana's stat/gauge default is `lastNotNull`; the pie (part-to-whole) passes `sum`.
export function addStandardDataReduceOptions<T extends { reduceOptions?: ReduceDataOptions }>(
  builder: PanelOptionsEditorBuilder<T>,
  includeFieldMatcher = true,
  defaultCalc: string = ReducerID.lastNotNull
) {
  const valueOptionsCategory = [t('stat.add-standard-data-reduce-options.category-value-options', 'Value options')];

  builder.addRadio({
    path: 'reduceOptions.values',
    name: t('stat.add-standard-data-reduce-options.name-show', 'Show'),
    description: t(
      'stat.add-standard-data-reduce-options.description-show',
      'Calculate a single value per column or series or show each row'
    ),
    settings: {
      options: [
        { value: false, label: t('stat.add-standard-data-reduce-options.show-options.label-calculate', 'Calculate') },
        { value: true, label: t('stat.add-standard-data-reduce-options.show-options.label-all-values', 'All values') },
      ],
    },
    category: valueOptionsCategory,
    defaultValue: false,
  });

  builder.addNumberInput({
    path: 'reduceOptions.limit',
    name: t('stat.add-standard-data-reduce-options.name-limit', 'Limit'),
    description: t('stat.add-standard-data-reduce-options.description-limit', 'Max number of rows to display'),
    category: valueOptionsCategory,
    settings: {
      placeholder: '25',
      integer: true,
      min: 1,
      max: 5000,
    },
    showIf: (options) => options.reduceOptions?.values === true,
  });

  builder.addCustomEditor({
    id: 'reduceOptions.calcs',
    path: 'reduceOptions.calcs',
    name: t('stat.add-standard-data-reduce-options.name-calculation', 'Calculation'),
    description: t(
      'stat.add-standard-data-reduce-options.description-calculation',
      'Choose a reducer function / calculation'
    ),
    category: valueOptionsCategory,
    editor: standardEditorsRegistry.get('stats-picker').editor,
    // TODO: Get ReducerID from generated schema one day?
    defaultValue: [defaultCalc],
    // Hides it when all values mode is on. Null-safe so it stays visible on the
    // Calculate default (unset `reduceOptions` => `values` undefined).
    showIf: (currentConfig) => currentConfig.reduceOptions?.values !== true,
  });

  if (includeFieldMatcher) {
    builder.addSelect({
      path: 'reduceOptions.fields',
      name: t('stat.add-standard-data-reduce-options.name-fields', 'Fields'),
      description: t(
        'stat.add-standard-data-reduce-options.description-fields',
        'Select the fields that should be included in the panel'
      ),
      category: valueOptionsCategory,
      settings: {
        allowCustomValue: true,
        options: [],
        getOptions: async (context: FieldOverrideContext) => {
          const options = [
            {
              value: '',
              label: t('stat.add-standard-data-reduce-options.fields-options.label-numeric-fields', 'Numeric Fields'),
            },
            {
              value: '/.*/',
              label: t('stat.add-standard-data-reduce-options.fields-options.label-all-fields', 'All Fields'),
            },
          ];
          if (context && context.data) {
            for (const frame of context.data) {
              for (const field of frame.fields) {
                const name = getFieldDisplayName(field, frame, context.data);
                const value = `/^${escapeStringForRegex(name)}$/`;
                options.push({ value, label: name });
              }
            }
          }
          return Promise.resolve(options);
        },
      },
      defaultValue: '',
    });
  }
}
