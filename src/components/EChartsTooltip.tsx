import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  buildTooltipModel,
  EChartsTooltipParam,
  TooltipBuildContext,
  TooltipKind,
  TooltipModel,
} from 'echarts/options/tooltip';
import { ValueFormatter } from 'echarts/style';
import { VizTooltipContent, VizTooltipHeader, VizTooltipWrapper } from 'grafana/VizTooltip';
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Lazily create the detached element ECharts positions and we portal into. */
const createContainer = () => document.createElement('div');

/**
 * The Grafana tooltip box. Styling mirrors Core Grafana's uPlot tooltip wrapper
 * (`TooltipPlugin2`): elevated background, weak border, default radius, z2
 * shadow. ECharts owns positioning, so position/zIndex are deliberately left
 * off here.
 */
const getStyles = (theme: GrafanaTheme2) => ({
  box: css({
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.weak}`,
    boxShadow: theme.shadows.z2,
    color: theme.colors.text.primary,
    userSelect: 'text',
    maxWidth: '420px',
  }),
});

const GrafanaTooltipBox: React.FC<{ model: TooltipModel }> = ({ model }) => {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.box}>
      <VizTooltipWrapper>
        <VizTooltipHeader item={model.header} isPinned={false} />
        <VizTooltipContent items={model.items} isPinned={false} />
      </VizTooltipWrapper>
    </div>
  );
};

interface UseGrafanaEChartsTooltipArgs {
  kind: TooltipKind;
  valueFormatter: ValueFormatter;
  timeZone: string;
  /** Radar indicator (axis) names, in option order. Ignored for other kinds. */
  radarIndicators: string[];
}

interface GrafanaEChartsTooltip {
  /**
   * ECharts `tooltip.formatter`. Stashes the hovered params into React state and
   * returns a persistent container element that ECharts positions; the Grafana
   * tooltip is portaled into that element so React context (theme/emotion) flows
   * through.
   */
  formatter: (params: EChartsTooltipParam | EChartsTooltipParam[]) => HTMLElement;
  /** Portal node to render inside the panel's React tree. */
  portal: ReactNode;
}

/**
 * Bridge ECharts' native tooltip to a Grafana-styled React tooltip. ECharts
 * keeps doing hit-testing, axis-pointer drawing, and positioning; we replace the
 * rendered content with Grafana's tooltip components.
 */
export function useGrafanaEChartsTooltip({
  kind,
  valueFormatter,
  timeZone,
  radarIndicators,
}: UseGrafanaEChartsTooltipArgs): GrafanaEChartsTooltip {
  // Stable across renders so ECharts can reuse the same positioned element; held
  // as state (not a ref) so it can be read during render to host the portal.
  const [container] = useState<HTMLDivElement>(createContainer);
  const [model, setModel] = useState<TooltipModel | null>(null);

  // The formatter must be stable (it is baked into the ECharts option), so the
  // latest mapping context is read from a ref instead of the closure. The ref is
  // synced in an effect (hovers happen after commit, so it is always current).
  const ctxRef = useRef<TooltipBuildContext>({ kind, valueFormatter, timeZone, radarIndicators });
  useEffect(() => {
    ctxRef.current = { kind, valueFormatter, timeZone, radarIndicators };
  }, [kind, valueFormatter, timeZone, radarIndicators]);

  const formatter = useCallback(
    (params: EChartsTooltipParam | EChartsTooltipParam[]) => {
      setModel(buildTooltipModel(params, ctxRef.current));
      return container;
    },
    [container]
  );

  const portal = model && model.items.length > 0 ? createPortal(<GrafanaTooltipBox model={model} />, container) : null;

  return { formatter, portal };
}
