import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { SOURCE_LABEL, TARGET_LABEL } from 'lib/echarts/converters/graphWide';
import { addAdvancedTextInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Which label an endpoint is filtered on, when a pinned tooltip's "Filter on" /
 * "Filter out" buttons write an ad-hoc filter into the dashboard.
 *
 * **The one relations option that is about the query rather than the chart**, and it
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
 * **A last resort now, not the first one.** The panel reads the conventional endpoint
 * pairs directly (`ENDPOINT_LABEL_PAIRS`), so `sum by (client, server)` draws with no
 * `label_replace` at all — and the pair it read is recorded on the frame
 * (`ENDPOINT_LABELS_META`) and used for the filters automatically. These two are for the
 * query that cannot be rewritten, where the key really is gone.
 *
 * Unset therefore means "whatever the response said", falling back to the frame's own
 * keys.
 *
 * Advanced-tier, like every other option that needs a query author rather than a
 * dashboard reader — which means a provisioned dashboard that sets it must also set
 * `editorMode: 'advanced'`, or Default mode resets it. See `docs/options-modes.md`.
 */
export function addRelationsFilterOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedTextInput(builder, {
    path: 'relationsSourceFilterLabel',
    name: 'Source filter label',
    description: `Override the label a filter writes a link's source under. Read from the response otherwise, or "${SOURCE_LABEL}"`,
    settings: { placeholder: SOURCE_LABEL },
  });

  addAdvancedTextInput(builder, {
    path: 'relationsTargetFilterLabel',
    name: 'Target filter label',
    description: `Override the label a filter writes a link's target under. Read from the response otherwise, or "${TARGET_LABEL}"`,
    settings: { placeholder: TARGET_LABEL },
  });
}
