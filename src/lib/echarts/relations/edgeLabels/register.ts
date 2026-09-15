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
 * Stop edge values from fading in after each rebuild.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
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
        // A dirty host recalculates its text position.
        host.markRedraw();
      }

      // Edge labels yield to labels already placed by ECharts.
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
