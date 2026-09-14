import { type FieldColorConfigSettings, FieldConfigProperty } from '@grafana/data';
import {
  STANDARD_COLOR_OPTION,
  STANDARD_COLOR_SETTINGS,
  STANDARD_FIELD_OPTIONS,
} from 'lib/grafana/editor/common/fieldConfig';

/**
 * The same options with **"Color series by" off**, for the relations family.
 *
 * `bySeriesSupport` is what puts that Last / Min / Max radio under the colour scheme,
 * and only ever when a by-value mode is picked — `FieldColorEditor` renders it on
 * `item.settings?.bySeriesSupport && colorMode.isByValue`. What it writes, `color.seriesBy`,
 * is read by exactly one function in Grafana: `getFieldSeriesColor`, which this plugin
 * reaches through `getSeriesColor` (`lib/echarts/style.ts`). That covers the families whose
 * mark is a whole series — cartesian, stream, heatmap, multivariate, and the pie's legend —
 * and **not** relations: a relations mark is one node or one edge, coloured by
 * `field.display(value)` where `value` is that mark reduced by `reduceOptions.calcs[0]`
 * (`colorOf`). The radio changed nothing there, on the mark or in the legend, which reads
 * the same model. Offered and inert is worse than absent.
 *
 * Implementing it instead would duplicate a control the family already has: "Calculation"
 * is the visible answer to "which value speaks for this mark", and the same reducer drives
 * the tooltip, the node label and the edge weight. A second reducer for the colour alone
 * would let a node be coloured by its max while it is labelled with its mean.
 *
 * `byValueSupport` stays **on**: that is what keeps thresholds and the `continuous-*`
 * schemes in the picker at all, and those do colour a relations mark.
 */
export const RELATIONS_FIELD_OPTIONS = {
  ...STANDARD_FIELD_OPTIONS,
  [FieldConfigProperty.Color]: {
    ...STANDARD_COLOR_OPTION,
    // Spread from the typed settings rather than read back off the option, whose
    // `settings` is `any` — the one key that differs has to be the only difference.
    settings: { ...STANDARD_COLOR_SETTINGS, bySeriesSupport: false } satisfies FieldColorConfigSettings,
  },
};
