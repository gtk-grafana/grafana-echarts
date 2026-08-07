import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import {
  type RelationsLinkItem,
  type RelationsMark,
  type RelationsMarks,
  type RelationsNodeItem,
  type TooltipModel,
  type TooltipRow,
} from 'lib/echarts/tooltip/types';

/**
 * How a mark with **no field of its own** formats: plainly, with no unit.
 *
 * A safety net rather than a path with traffic. A node derived from an edge's endpoints is
 * the only mark that can reach it, and one now carries no stat at all — no value, no row —
 * so the tooltip omits the row and the node label stays one line before this is consulted.
 *
 * It stays because the alternative fallback is actively wrong: the panel-level formatter is
 * `getRepresentativeFormatter`, the first numeric field of the first frame, which is the
 * "unit decided by frame order" rule the field contract exists to remove. Measured on the
 * proof dashboard when derived nodes still carried their degree — with a `ms` override on
 * the first edge, every one of them read `2 ms`.
 */
export const formatDerivedMarkValue: ValueFormatter = (value) => ({ text: String(value) });

/**
 * A `graph` series emits both node and link hovers through one formatter, so the
 * model has to tell them apart. ECharts sets `dataType` to `'node'` or `'edge'` on
 * the callback params for graph-like series, which is the documented discriminator.
 * https://echarts.apache.org/en/option.html#series-graph.tooltip
 */
function isLinkItem(value: unknown): value is RelationsLinkItem {
  return typeof value === 'object' && value !== null && 'source' in value && 'target' in value;
}

function isNodeItem(value: unknown): value is RelationsNodeItem {
  return typeof value === 'object' && value !== null && 'id' in value && !isLinkItem(value);
}

/** A mark that has a field of its own; a derived node has neither and is skipped. */
type FieldedMark = { id: string; markKey?: string; field?: Field; sourceRowIndex?: number };

/**
 * Keyed by `markKey ?? id`, which is the same expression the three render variants put on
 * each item's `markId`.
 *
 * The fallback is the normal case and keeps the readable name in the item. `markKey` only
 * exists when the reader collected several marks sharing one `field.name` — N raw frames
 * whose value field is called `Value` — and without it this map would be last-write-wins,
 * so every one of those edges would format with the last one's unit and surface its
 * `config.links`. That is precisely the "the tooltip formats with somebody else's field"
 * bug the per-mark lookup exists to kill. Nodes never carry one: node ids are the ECharts
 * graph keys and are unique by construction.
 */
function toMarkMap(marks: FieldedMark[], theme: GrafanaTheme2, timeZone?: string): Map<string, RelationsMark> {
  const byKey = new Map<string, RelationsMark>();
  for (const { id, markKey, field, sourceRowIndex } of marks) {
    if (field != null) {
      byKey.set(markKey ?? id, {
        formatValue: getValueFormatter(field, theme, timeZone),
        // A wide frame reduces to a single row, so the row is the mark's own `0`;
        // the fallback only matters for a fixture that omitted it.
        source: { field, rowIndex: sourceRowIndex ?? 0 },
      });
    }
  }
  return byKey;
}

/**
 * Each mark's own display processor and link source, built once per render.
 *
 * This is what closes "tooltip unit decided by frame order" and gaps 1-3 of
 * `todo/relations-data-links.md` at the same time, because both had the same cause:
 * the tooltip resolved *one* field for the whole series (the frame's first numeric
 * column), so every node formatted with that field's unit and surfaced that field's
 * links. A mark is a field now, so each one answers for itself — two nodes can carry
 * different units, and a `byName` `links` override paints a link on exactly one node.
 */
export function getRelationsTooltipMarks(data: NodeGraphData, theme: GrafanaTheme2, timeZone?: string): RelationsMarks {
  return {
    nodes: toMarkMap(data.nodes, theme, timeZone),
    links: toMarkMap(data.links, theme, timeZone),
  };
}

/**
 * Tooltip content model for the relations series, rendered by the React overlay
 * (`EChartsTooltip`).
 *
 * A relations hover is always a single node or a single link — there is no shared
 * axis pointer — so this is built in the series formatter rather than via an
 * axis-triggered tooltip, matching the hierarchy and pie families.
 *
 * - **Node**: name as header; the main stat as the `Value` row, plus `Subtitle` and
 *   `secondarystat` rows when present.
 * - **Link**: `source → target` as header; the resolved weight as `Value`.
 *
 * Values format with the **hovered mark's own** field, and the footer resolves that
 * field's data links; see {@link getRelationsTooltipMarks}. A node derived from an
 * edge's endpoints has no field, so it formats through {@link formatDerivedMarkValue}
 * and shows no footer — `todo/relations-data-links.md` gap 4, which the contract does
 * not close.
 */
export function buildRelationsTooltipModel(marks?: RelationsMarks): (params: TopLevelFormatterParams) => TooltipModel {
  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const data: unknown = param?.data;
    const color = typeof param?.color === 'string' ? param.color : undefined;

    if (isLinkItem(data)) {
      // The edge's own field: its unit formats the weight and its `config.links`
      // fill the footer. Keyed by `markId` because two parallel edges share their
      // endpoints — see `RelationsLinkItem.markId`.
      const mark = data.markId != null ? marks?.links.get(data.markId) : undefined;
      const rows: TooltipRow[] = [
        {
          color,
          label: 'Value',
          value: formatEChartsValue(data.value ?? null, mark?.formatValue ?? formatDerivedMarkValue),
          source: mark?.source,
        },
      ];
      return { header: { label: `${data.source} → ${data.target}`, value: '' }, rows, source: mark?.source };
    }

    const node = isNodeItem(data) ? data : undefined;
    const mark = node != null ? marks?.nodes.get(node.id) : undefined;

    // `stat` first: the sankey and chord variants carry the main stat there rather than
    // in `value`, which they leave to ECharts' flow computation. See `RelationsNodeItem`.
    const stat = node?.stat ?? node?.value ?? null;

    const rows: TooltipRow[] = [];
    // No stat, no row. A node the response only implied has nothing to report
    // (`converters/deriveNodes.ts`), and rendering the field's empty-value text under a
    // `Value` label would read as a measurement that failed rather than one that was never
    // asked for. The header, the subtitle and the data-link footer all still render.
    if (stat != null) {
      rows.push({
        color,
        label: 'Value',
        value: formatEChartsValue(stat, mark?.formatValue ?? formatDerivedMarkValue),
        source: mark?.source,
      });
    }
    if (node?.subtitle != null) {
      rows.push({ label: 'Subtitle', value: node.subtitle });
    }
    if (node?.secondary != null) {
      // The reducer path already formatted the secondary stat through the mark's own
      // display processor (`secondaryOf`), so a number only reaches here from a
      // `secondarystat` label the conversion carried, which has no unit of its own.
      rows.push({
        label: 'Secondary',
        value:
          typeof node.secondary === 'number'
            ? formatEChartsValue(node.secondary, mark?.formatValue ?? formatDerivedMarkValue)
            : String(node.secondary),
      });
    }

    return { header: { label: node?.name ?? String(param?.name ?? ''), value: '' }, rows, source: mark?.source };
  };
}
