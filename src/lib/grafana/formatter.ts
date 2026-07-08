import { type DataFrame, type Field, FieldType, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { getValueFormatter } from 'lib/echarts/style';

export const getRepresentativeFormatter = (
  series: DataFrame[],
  theme: GrafanaTheme2,
  timeZone: string
): ValueFormatter => {
  let numericField: Field<FieldType.number> | undefined;
  for (const frame of series) {
    numericField = frame.fields.find((field) => field.type === FieldType.number);
    if (numericField) {
      break;
    }
  }

  if (!numericField) {
    return (value: unknown) => {
      if (value?.toString) {
        return {
          text: value.toString(),
        };
      }
      throw new Error(`unknown formatter for value: ${value}`);
    };
  }

  return getValueFormatter(numericField, theme, timeZone);
};
