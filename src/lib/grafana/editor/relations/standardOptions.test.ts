import { FieldColorModeId, FieldConfigProperty } from '@grafana/data';
import { STANDARD_FIELD_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';
import { RELATIONS_FIELD_OPTIONS } from 'lib/grafana/editor/relations/standardOptions';
describe('standard Color option', () => {
  const colorSettings = (options: typeof STANDARD_FIELD_OPTIONS) =>
    options[FieldConfigProperty.Color].settings as {
      byValueSupport: boolean;
      bySeriesSupport: boolean;
      preferThresholdsMode: boolean;
    };

  it('offers "Color series by" to the families whose mark is a series', () => {
    expect(colorSettings(STANDARD_FIELD_OPTIONS).bySeriesSupport).toBe(true);
  });

  it('withholds it from relations, where nothing reads seriesBy', () => {
    expect(colorSettings(RELATIONS_FIELD_OPTIONS).bySeriesSupport).toBe(false);
  });

  it('keeps by-value schemes available to every family', () => {
    expect(colorSettings(STANDARD_FIELD_OPTIONS).byValueSupport).toBe(true);
    expect(colorSettings(RELATIONS_FIELD_OPTIONS).byValueSupport).toBe(true);
  });

  /** Nothing else diverges: same default, same thresholds preference, same Filterable. */
  it('differs from the shared block in that one setting only', () => {
    expect(RELATIONS_FIELD_OPTIONS[FieldConfigProperty.Color].defaultValue).toEqual({
      mode: FieldColorModeId.PaletteClassic,
    });
    expect(colorSettings(RELATIONS_FIELD_OPTIONS).preferThresholdsMode).toBe(false);
    expect(RELATIONS_FIELD_OPTIONS[FieldConfigProperty.Filterable]).toBe(
      STANDARD_FIELD_OPTIONS[FieldConfigProperty.Filterable]
    );
  });
});
