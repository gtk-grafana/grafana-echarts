import { registerUpdateLifecycle } from 'echarts/core';
import {
  hideLabel,
  isLabelHost,
  labelBox,
  type LabelBox,
  type LabelHost,
  overlaps,
  readGraph,
} from 'lib/echarts/relations/edgeLabels/geometry';
import { markKey, type RevealIndex, setRevealIndex } from 'lib/echarts/relations/edgeLabels/reveal';

/**
 * Repair edge labels after the shared ECharts label-layout stage.
 *
 * `LabelManager.updateLayoutConfig` sets `textConfig.local` to `false`.
 * Most managed labels then use canvas coordinates.
 * `Line.beforeUpdate` sets edge labels with `local: true` because a line positions its label in local coordinates.
 * If `local` stays false, edge labels do not move with graph pan or zoom.
 *
 * ECharts `hideOverlap` reads a stored rectangle before `Line.beforeUpdate` positions the edge label.
 * The stale rectangle makes an unchanged fixture show 1, 2, 3, then 4 labels across four renders.
 * This hook settles the edge geometry before it does the overlap test.
 * Node labels keep priority because a name identifies a mark and an edge value also appears in the tooltip.
 *
 * Hidden labels return when their edge or an endpoint gets focus.
 * Do not use an emphasis state for `ignore`.
 * `_savePrimaryToNormal` copies `ignore` into `_normalState`, so the next state change hides a label revealed elsewhere.
 *
 * Use `series:layoutlabels`, not `series:afterupdate`.
 * Graph zoom calls `updateLabelLayout()` without a series update.
 * It also supplies no `updatedSeries`, so this hook examines every series.
 *
 * Hook order is part of this repair.
 * `registerEdgeLabelFadeIn` must run before the ECharts `LabelLayout` feature.
 * `registerEdgeLabelLayout` must run after that feature.
 * A different order silently breaks sankey edge labels.
 */

/**
 * Stop sankey edge values from fading in after each rebuild.
 *
 * Sankey creates new label hosts on each render, so `LabelManager` finds no old layout.
 * It then uses `animationDuration` for a new fade.
 * Set `disableLabelAnimation` before the label-layout stage reads the host.
 * Graph reuses label hosts, but the same setting is safe there.
 * https://echarts.apache.org/en/option.html#animationDuration
 */
export function registerEdgeLabelFadeIn(): void {
  registerUpdateLifecycle('series:layoutlabels', (ecModel) => {
    ecModel.eachSeries((seriesModel) => {
      // Graph and sankey expose the same graph model.
      const graph = readGraph(seriesModel);
      if (graph == null) {
        return;
      }
      for (let dataIndex = 0; dataIndex < graph.edgeData.count(); dataIndex++) {
        const host = graph.edgeData.getItemGraphicEl(dataIndex);
        if (isLabelHost(host)) {
          host.disableLabelAnimation = true;
        }
      }
    });
  });
}

/**
 * Restore local edge-label transforms, remove overlaps, and index hidden labels for focus.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export function registerEdgeLabelLayout(): void {
  registerUpdateLifecycle('series:layoutlabels', (ecModel, api) => {
    const revealed: RevealIndex = new Map();
    ecModel.eachSeries((seriesModel) => {
      // The graph model links each edge label to its endpoint nodes.
      const graph = readGraph(seriesModel);
      const group = api.getViewOfSeriesModel(seriesModel)?.group;
      if (graph == null || group == null) {
        return;
      }

      // Read by index to keep each edge with its endpoints.
      const edges: Array<{ host: LabelHost; nodes: number[]; dataIndex: number }> = [];
      for (let dataIndex = 0; dataIndex < graph.edgeData.count(); dataIndex++) {
        const host = graph.edgeData.getItemGraphicEl(dataIndex);
        const edge = graph.getEdgeByIndex(dataIndex);
        if (!isLabelHost(host) || host.textConfig?.local !== false || edge == null) {
          continue;
        }
        edges.push({ host, nodes: [edge.node1.dataIndex, edge.node2.dataIndex], dataIndex });
      }
      if (edges.length === 0) {
        return;
      }

      // Restore host anchoring before measuring labels.
      for (const { host } of edges) {
        host.setTextConfig({ local: true });
        // A redraw makes `updateInnerText` read the restored `local` value.
        host.markRedraw();
      }

      // Node names keep priority over edge values, which also appear in tooltips.
      const edgeHosts = new Set(edges.map(({ host }) => host));
      const taken: LabelBox[] = [];
      group.traverse((element) => {
        if (isLabelHost(element) && element.textConfig?.local === false && !edgeHosts.has(element)) {
          const box = labelBox(element);
          if (box != null) {
            taken.push(box);
          }
        }
      });

      for (const { host, nodes, dataIndex } of edges) {
        const box = labelBox(host);
        if (box == null) {
          continue;
        }
        if (!taken.some((other) => overlaps(box, other))) {
          taken.push(box);
          continue;
        }
        const label = hideLabel(host);
        if (label == null) {
          continue;
        }
        // Reveal the label when its edge or either endpoint has focus.
        const keys = [
          markKey(seriesModel.seriesIndex, 'edge', dataIndex),
          ...nodes.map((node) => markKey(seriesModel.seriesIndex, 'node', node)),
        ];
        for (const key of keys) {
          revealed.set(key, [...(revealed.get(key) ?? []), label]);
        }
      }
    });

    // Replace labels because each render recalculates overlap.
    setRevealIndex(api.getZr(), revealed);
  });
}
