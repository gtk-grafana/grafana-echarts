import { type FieldConfigEditorBuilder } from '@grafana/data';
import { type EChartsRelationsFieldConfig } from 'editor/types';
import { SOURCE_LABEL, TARGET_LABEL } from 'lib/echarts/converters/graphWide';

/**
 * Which label a mark's endpoint is filtered on, when a pinned tooltip's "Filter on" /
 * "Filter out" buttons write an ad-hoc filter into the dashboard.
 *
 * **@deprecated — kept for demonstration, slated for removal.** Nothing in this repo sets
 * it any more, and no response shape has been found that needs it *and* cannot be fixed in
 * the query instead. It survives only so the failure it used to fix can still be shown
 * (`provisioning/dashboards/relations/*adhoc-filters.json`, panel 7) and so a dashboard
 * that set it does not silently break. **Remove it before release unless a real use turns
 * up** — there is no migration layer in this plugin, so removal makes such a dashboard
 * write `source=…` again, which returns nothing and reports no error.
 *
 * The setting exists because the contract's endpoint keys are a topology carrier, not a
 * promise about the datasource. The query that made it necessary is
 *
 *     sum by (source, target) (label_replace(…, "source", "$1", "client", "(.*)"))
 *
 * which leaves the *frame* labelled `source`/`target` while the metric underneath is
 * still labelled `client`/`server` — and then aggregates the original away, so nothing
 * downstream can recover it. A filter built from the frame is `source="web-api"`, which
 * is a label the datasource has never heard of, and the dashboard silently returns
 * nothing.
 *
 * **Why it is deprecated: keeping the original key is strictly better, and always
 * available.** Four routes reach the right key before this one does, and between them they
 * cover every query that has not thrown the key away:
 *
 * - the panel reads the conventional endpoint pairs directly (`ENDPOINT_LABEL_PAIRS`), so
 *   `sum by (client, server)` draws with no `label_replace` at all, and the pair it read is
 *   recorded on the frame (`withEndpointLabelsMeta`) and used for the filters automatically;
 * - for a query that *does* relabel, keeping the original in the outer aggregation —
 *   `sum by (source, target, client_k8s_cluster_name, server_k8s_cluster_name)` — lets the
 *   reader recover the key by matching the endpoint values back against the labels, **per
 *   edge** (`aliasEndpointKeys`). The rename is 1:1, so naming the original in `by` splits
 *   no group and costs no cardinality;
 * - the same works on the **dashboard-transformation** route: leave the original columns
 *   out of `organize`'s `excludeByName` and `rowsToFields` carries them onto each edge as
 *   labels, where the same recovery finds them. This is what the `devcortex-sources` panels
 *   used to need the setting for;
 * - a **node** takes its keys from the edges touching it (`nodeFilterLabels`), so nothing
 *   has to be configured per node either.
 *
 * Recovery is also *more* correct than this setting on a multi-level flow, which is what
 * retired the last real use: the levels relabel from different originals, so one configured
 * pair is wrong for every level but one, while the recovery answers per edge.
 *
 * Two cases are left, and neither has shown up in practice. A query whose original really
 * is gone **and** which cannot be edited — provisioned, imported, a library panel, a
 * recording rule. And an ambiguous recovery, where two labels hold the same value as an
 * endpoint and `aliasEndpointKeys` declines to guess.
 *
 * **Override-only** (`hideFromDefaults`), like the rest of the per-mark config. It used to
 * keep its defaults editor on the argument that one response usually groups by one pair, so
 * "every mark" was the common answer rather than a nonsensical one. That argument died with
 * the routes above: if the whole response needs one pair stated by hand, the query needed
 * fixing instead, and offering it in the Fields tab advertises the wrong fix.
 *
 * The buttons themselves only appear when the mark's standard **Filterable** config is
 * set; see `markFilterable` in `lib/echarts/tooltip/relations.ts`.
 */
/**
 * Their own section rather than "Node" or "Edge": both kinds of mark read them — an edge
 * filters on both of its endpoints, a node on the two directions of itself — so filing
 * them under either would say they apply to one.
 */
const FILTER_CATEGORY = ['Ad-hoc filters (deprecated)'];

export function addRelationsFilterConfig(builder: FieldConfigEditorBuilder<EChartsRelationsFieldConfig>): void {
  builder
    .addTextInput({
      path: 'sourceFilterLabel',
      name: 'Source filter label',
      description:
        'Deprecated, and due to be removed: keep the original label in the query instead — ' +
        `the panel recovers it per edge. Label an ad-hoc filter writes this mark's source endpoint under. Read from the response otherwise, or "${SOURCE_LABEL}"`,
      category: FILTER_CATEGORY,
      settings: { placeholder: SOURCE_LABEL },
      hideFromDefaults: true,
    })
    .addTextInput({
      path: 'targetFilterLabel',
      name: 'Target filter label',
      description:
        'Deprecated, and due to be removed: keep the original label in the query instead — ' +
        `the panel recovers it per edge. Label an ad-hoc filter writes this mark's target endpoint under. Read from the response otherwise, or "${TARGET_LABEL}"`,
      category: FILTER_CATEGORY,
      settings: { placeholder: TARGET_LABEL },
      hideFromDefaults: true,
    });
}
