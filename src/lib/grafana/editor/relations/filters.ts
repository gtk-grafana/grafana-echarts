import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { SOURCE_LABEL, TARGET_LABEL } from 'lib/echarts/converters/graphWide';
import { addAdvancedTextInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Which label an endpoint is filtered on, when a pinned tooltip's "Filter for" /
 * "Filter out" buttons write an ad-hoc filter into the dashboard.
 *
 * **The one relations option that is about the query rather than the chart**, and it
 * exists because the contract's endpoint keys are a topology carrier, not a promise
 * about the datasource. The canonical relations query is
 *
 *     sum by (source, target) (label_replace(…, "source", "$1", "client", "(.*)"))
 *
 * which leaves the *frame* labelled `source`/`target` while the metric underneath is
 * still labelled `client`/`server` — the aggregation dropped the original. A filter
 * built from the frame is therefore `source="web-api"`, which is a label the
 * datasource has never heard of, and the dashboard silently returns nothing. The
 * panel cannot recover the key, so it is asked for.
 *
 * Unset means pass-through: the frame's own keys, which is right whenever the query
 * really does group by `source`/`target` on the raw metric.
 *
 * Advanced-tier, like every other option that needs a query author rather than a
 * dashboard reader — which means a provisioned dashboard that sets it must also set
 * `editorMode: 'advanced'`, or Default mode resets it. See `docs/options-modes.md`.
 */
export function addRelationsFilterOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedTextInput(builder, {
    path: 'relationsSourceFilterLabel',
    name: 'Source filter label',
    description: `Label a "Filter for" button writes a link's source under. Defaults to "${SOURCE_LABEL}"`,
    settings: { placeholder: SOURCE_LABEL },
  });

  addAdvancedTextInput(builder, {
    path: 'relationsTargetFilterLabel',
    name: 'Target filter label',
    description: `Label a "Filter for" button writes a link's target under. Defaults to "${TARGET_LABEL}"`,
    settings: { placeholder: TARGET_LABEL },
  });
}
