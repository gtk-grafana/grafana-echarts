import { FieldColorModeId, FieldConfigProperty } from '@grafana/data';
import { RELATIONS_FIELD_OPTIONS, STANDARD_FIELD_OPTIONS } from 'lib/grafana/editor/common/fieldConfig';

/**
 * Two colour blocks that differ in one key, which is exactly why this is pinned: they
 * read as duplication worth merging, and merging them puts an inert control back in the
 * relations editor (or takes a working one off five other families).
 */
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

  /**
   * `color.seriesBy` is read by `getFieldSeriesColor` alone, which relations never calls:
   * a node or an edge is coloured by `field.display(value)` with `value` reduced by
   * `reduceOptions.calcs[0]`. See `RELATIONS_FIELD_OPTIONS`.
   */
  it('withholds it from relations, where nothing reads seriesBy', () => {
    expect(colorSettings(RELATIONS_FIELD_OPTIONS).bySeriesSupport).toBe(false);
  });

  /**
   * The distinction that matters: withholding the *radio* must not withhold the by-value
   * **schemes**, which do colour a relations mark — `byValueSupport` is what keeps
   * thresholds and every `continuous-*` mode in the picker (`FieldColorEditor` filters
   * `isByValue` modes out without it).
   */
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
