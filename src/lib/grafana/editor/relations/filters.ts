import { type FieldConfigEditorBuilder } from '@grafana/data';
import { type EChartsRelationsFieldConfig } from 'editor/types';
import { SOURCE_LABEL, TARGET_LABEL } from 'lib/echarts/converters/graphWide';

/**
 * Which label a mark's endpoint is filtered on, when a pinned tooltip's "Filter on" /
 * "Filter out" buttons write an ad-hoc filter into the dashboard.
 *
 * **The one relations setting that is about the query rather than the chart**, and it
 * exists because the contract's endpoint keys are a topology carrier, not a promise
 * about the datasource. The query that made it necessary is
 *
 *     sum by (source, target) (label_replace(…, "source", "$1", "client", "(.*)"))
 *
 * which leaves the *frame* labelled `source`/`target` while the metric underneath is
 * still labelled `client`/`server` — and then aggregates the original away, so nothing
 * downstream can recover it. A filter built from the frame is `source="web-api"`, which
 * is a label the datasource has never heard of, and the dashboard silently returns
 * nothing.
 *
 * **A last resort, not the first one.** The panel reads the conventional endpoint pairs
 * directly (`ENDPOINT_LABEL_PAIRS`), so `sum by (client, server)` draws with no
 * `label_replace` at all — and the pair it read is recorded on the frame
 * (`ENDPOINT_LABELS_META`) and used for the filters automatically. These two are for the
 * query that cannot be rewritten, where the key really is gone.
 *
 * **Field config rather than a panel option**, which is what the `graph-*-wide` pivot
 * bought: a mark is a field, so a panel joining two queries can answer differently per
 * edge instead of forcing one key onto marks that never carried it. Unlike the rest of
 * the per-mark config these keep their **defaults** editor (no `hideFromDefaults`): one
 * response usually does group by one pair, and the Fields tab is where "every mark" is
 * said once — which is exactly what the retired `relationsSourceFilterLabel` panel
 * option did, in a place a per-mark override could not reach.
 *
 * The buttons themselves only appear when the mark's standard **Filterable** config is
 * set; see `resolveFilters` in `lib/components/tooltip/EChartsTooltip.tsx`.
 */
/**
 * Their own section rather than "Node" or "Edge": both kinds of mark read them — an edge
 * filters on both of its endpoints, a node on the two directions of itself — so filing
 * them under either would say they apply to one.
 */
const FILTER_CATEGORY = ['Ad-hoc filters'];

export function addRelationsFilterConfig(builder: FieldConfigEditorBuilder<EChartsRelationsFieldConfig>): void {
  builder
    .addTextInput({
      path: 'sourceFilterLabel',
      name: 'Source filter label',
      description: `Label an ad-hoc filter writes this mark's source endpoint under. Read from the response otherwise, or "${SOURCE_LABEL}"`,
      category: FILTER_CATEGORY,
      settings: { placeholder: SOURCE_LABEL },
    })
    .addTextInput({
      path: 'targetFilterLabel',
      name: 'Target filter label',
      description: `Label an ad-hoc filter writes this mark's target endpoint under. Read from the response otherwise, or "${TARGET_LABEL}"`,
      category: FILTER_CATEGORY,
      settings: { placeholder: TARGET_LABEL },
    });
}
