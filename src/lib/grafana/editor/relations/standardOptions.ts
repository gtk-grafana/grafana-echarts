import { type FieldColorConfigSettings, FieldConfigProperty } from '@grafana/data';
import {
  STANDARD_COLOR_OPTION,
  STANDARD_COLOR_SETTINGS,
  STANDARD_FIELD_OPTIONS,
} from 'lib/grafana/editor/common/fieldConfig';

/** The same options with "Color series by" off, for the relations family. */
export const RELATIONS_FIELD_OPTIONS = {
  ...STANDARD_FIELD_OPTIONS,
  [FieldConfigProperty.Color]: {
    ...STANDARD_COLOR_OPTION,
    // Copy typed settings because the option stores them as `any`.
    settings: { ...STANDARD_COLOR_SETTINGS, bySeriesSupport: false } satisfies FieldColorConfigSettings,
  },
  /** Display name: override-only. */
  [FieldConfigProperty.DisplayName]: { hideFromDefaults: true },
};

/** Standard field options that relations marks do not support. */
export const RELATIONS_DISABLED_FIELD_OPTIONS = [FieldConfigProperty.Actions, FieldConfigProperty.NoValue];
