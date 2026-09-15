import { type SeriesTypeOption } from 'editor/types';

/** An unset or automatic relations type selects graph. */
export const isGraphVariant = (options: { seriesType?: SeriesTypeOption }): boolean =>
  options.seriesType == null || options.seriesType === 'Auto' || options.seriesType === 'graph';

/** Returns true for the sankey variant. */
export const isSankeyVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'sankey';

/** Returns true for the chord variant. */
export const isChordVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'chord';
