#!/usr/bin/env python3
"""Generate the tooltip showcase dashboard.

The dashboard is committed JSON; this script exists so the 20-odd near-identical
panels stay consistent and can be regenerated after a panel-option change,
rather than being hand-edited. Run:

    python3 scripts/build-tooltip-showcase.py

Prettier governs `provisioning/**` (see `.prettierrc.js`), so the script formats
its output through it — otherwise the committed file fails `pnpm run lint`.
"""
import json
import pathlib
import subprocess

DS = {"type": "grafana-testdata-datasource", "uid": "trlxrdZVk"}
OUT = pathlib.Path(__file__).resolve().parent.parent / "provisioning/dashboards/tooltip-showcase.json"

CARTESIAN = "grafana-echartscartesian-panel"
PIE = "grafana-echartsparttowhole-panel"
HIERARCHY = "grafana-echartshierarchy-panel"
MULTIVARIATE = "grafana-echartsmultivariate-panel"
HEATMAP = "grafana-echartsheatmap-panel"

LEGEND = {"showLegend": True, "displayMode": "list", "placement": "bottom", "calcs": []}

_ids = iter(range(1, 500))
_y = [0]


def row(title):
    return {
        "type": "row",
        "title": title,
        "collapsed": False,
        "id": next(_ids),
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": _next_y(1)},
        "panels": [],
    }


def _next_y(h):
    y = _y[0]
    _y[0] += h
    return y


def panel(*, ptype, title, description, options, targets, x, w, h=9, y=None,
          transformations=None, field_config=None, advance=True):
    p = {
        "datasource": DS,
        "type": ptype,
        "title": title,
        "description": description,
        "id": next(_ids),
        "gridPos": {"h": h, "w": w, "x": x, "y": y if y is not None else _y[0]},
        "fieldConfig": field_config or {"defaults": {"color": {"mode": "palette-classic"}}, "overrides": []},
        "options": options,
        "targets": [{**t, "datasource": DS} for t in targets],
    }
    if transformations:
        p["transformations"] = transformations
    return p


def csv(content, ref="A"):
    return {"refId": ref, "scenarioId": "csv_content", "csvContent": content}


def metric(values, alias, ref="A"):
    return {"refId": ref, "scenarioId": "csv_metric_values", "stringInput": values, "alias": alias}


def convert(pairs):
    return [{
        "id": "convertFieldType",
        "options": {"fields": {}, "conversions": [{"targetField": f, "destinationType": t} for f, t in pairs]},
    }]


def echarts_opts(series_type, mode="single", **extra):
    return {"seriesType": series_type, "legend": LEGEND, "tooltip": {"mode": mode, **extra.pop("tooltip", {})}, **extra}


panels = []

# ---------------------------------------------------------------- proximity
panels.append(row("Proximity hover — cursor near a series, not on a point"))
h = _next_y(9)
panels.append(panel(
    ptype=CARTESIAN, x=0, w=12, y=h,
    title="ECharts — Single",
    description=(
        "Hover anywhere in the plot. The tooltip appears whenever the cursor is within 30px "
        "VERTICALLY of a line (core's DEFAULT_FOCUS_PROXIMITY) — not only over a data point. "
        "Horizontal distance is unbounded, so the nearest point on that line wins however far "
        "left/right it is. Should behave identically to the uPlot panel on the right."
    ),
    options=echarts_opts("line"),
    targets=[metric("10,25,15,30,20,35,25", "alpha", "A"), metric("60,70,65,80,72,85,78", "bravo", "B")],
))
panels.append(panel(
    ptype="timeseries", x=12, w=12, y=h,
    title="uPlot (core) — Single",
    description="Core timeseries panel with the same data, as the parity reference.",
    options={"legend": LEGEND, "tooltip": {"mode": "single", "sort": "none"}},
    targets=[metric("10,25,15,30,20,35,25", "alpha", "A"), metric("60,70,65,80,72,85,78", "bravo", "B")],
))

h = _next_y(9)
panels.append(panel(
    ptype=CARTESIAN, x=0, w=8, y=h,
    title="Edge case — nothing within the band",
    description=(
        "Two series pinned far apart. Hover the empty middle of the plot: NO tooltip appears, "
        "because no series is within the 30px vertical band. This is core's behaviour in Single "
        "mode and the reason proximity is a vertical band, not a 2D radius."
    ),
    options=echarts_opts("line"),
    targets=[metric("2,3,2,3,2,3,2", "floor", "A"), metric("97,98,97,98,97,98,97", "ceiling", "B")],
))
panels.append(panel(
    ptype=CARTESIAN, x=8, w=8, y=h,
    title="Edge case — dense data (symbols auto-hidden)",
    description=(
        "A random walk dense enough that ECharts stops rendering point symbols. Proximity still "
        "resolves the nearest point, and the active-point marker is created on demand — the case "
        "that plain ECharts item-trigger hover cannot handle at all."
    ),
    options=echarts_opts("line"),
    targets=[
        {"refId": "A", "scenarioId": "random_walk", "alias": "dense-a"},
        {"refId": "B", "scenarioId": "random_walk", "alias": "dense-b"},
    ],
))
panels.append(panel(
    ptype=CARTESIAN, x=16, w=8, y=h,
    title="Edge case — null gaps",
    description=(
        "Series with null gaps. Hovering over a gap does not tooltip the gap: the resolver scans "
        "outward for the nearest real point and accepts it only within 15px "
        "(core's DEFAULT_HOVER_NULL_PROXIMITY). Nulls are never the active point."
    ),
    options=echarts_opts("line"),
    targets=[csv(
        "time,gappy,solid\n"
        "2021-07-13T17:00:00Z,10,40\n"
        "2021-07-13T17:10:00Z,,42\n"
        "2021-07-13T17:20:00Z,,44\n"
        "2021-07-13T17:30:00Z,25,46\n"
        "2021-07-13T17:40:00Z,30,48\n"
        "2021-07-13T17:50:00Z,,50\n"
        "2021-07-13T18:00:00Z,20,52\n"
    )],
    transformations=convert([("time", "time"), ("gappy", "number"), ("solid", "number")]),
))

# ------------------------------------------------------------ all mode
panels.append(row("All mode — proximity picks the emphasised row and the single active point"))
h = _next_y(9)
panels.append(panel(
    ptype=CARTESIAN, x=0, w=12, y=h,
    title="ECharts — All",
    description=(
        "Every series is listed, and the row nearest the cursor VERTICALLY is bolded — move up and "
        "down at a fixed x and the bold row follows. Exactly one point carries the enlarged active "
        "marker; ECharts would otherwise emphasise every series at that x (suppressed via "
        "axisPointer.triggerEmphasis: false). Move outside every band: the tooltip stays open with "
        "no bold row, matching core."
    ),
    options=echarts_opts("line", mode="multi", tooltip={"sort": "none", "hideZeros": False}),
    targets=[
        metric("10,25,15,30,20,35,25", "alpha", "A"),
        metric("40,45,42,55,48,60,52", "bravo", "B"),
        metric("70,75,72,85,78,90,82", "charlie", "C"),
    ],
))
panels.append(panel(
    ptype="timeseries", x=12, w=12, y=h,
    title="uPlot (core) — All",
    description="Core reference for the bolded-row behaviour.",
    options={"legend": LEGEND, "tooltip": {"mode": "multi", "sort": "none"}},
    targets=[
        metric("10,25,15,30,20,35,25", "alpha", "A"),
        metric("40,45,42,55,48,60,52", "bravo", "B"),
        metric("70,75,72,85,78,90,82", "charlie", "C"),
    ],
))

# ------------------------------------------------------------ pinning
panels.append(row("Pinning — click freezes content, position and the active point"))
h = _next_y(9)
panels.append(panel(
    ptype=CARTESIAN, x=0, w=12, y=h,
    title="Pin me (data links in the footer)",
    description=(
        "Click anywhere near a line to pin. While pinned: content, cursor position AND the enlarged "
        "active point all freeze — moving onto another series does not steal the marker. The footer "
        "with data links only renders when pinned. Dismiss with Escape, the close button, or a click "
        "outside. Note the pin works even when the click lands on empty grid near the line, not on a "
        "point — the pinned item comes from the proximity hit."
    ),
    options=echarts_opts("line"),
    field_config={
        "defaults": {
            "color": {"mode": "palette-classic"},
            "links": [{"title": "Open Grafana docs", "url": "https://grafana.com/docs/", "targetBlank": True}],
        },
        "overrides": [],
    },
    targets=[metric("10,25,15,30,20,35,25", "alpha", "A"), metric("55,60,58,70,64,75,68", "bravo", "B")],
))
panels.append(panel(
    ptype=CARTESIAN, x=12, w=12, y=h,
    title="Pin in All mode",
    description=(
        "Same, in All mode. The pinned footer resolves against the row you clicked nearest, and the "
        "bold row stays frozen on the series that was active at pin time."
    ),
    options=echarts_opts("line", mode="multi", tooltip={"sort": "desc", "hideZeros": False}),
    field_config={
        "defaults": {
            "color": {"mode": "palette-classic"},
            "links": [{"title": "Open Grafana docs", "url": "https://grafana.com/docs/", "targetBlank": True}],
        },
        "overrides": [],
    },
    targets=[
        metric("10,25,15,30,20,35,25", "alpha", "A"),
        metric("40,45,42,55,48,60,52", "bravo", "B"),
        metric("70,75,72,85,78,90,82", "charlie", "C"),
    ],
))

# ------------------------------------------------------- other families
panels.append(row("Other chart families — every family feeds the same React overlay"))
h = _next_y(9)
panels.append(panel(
    ptype=CARTESIAN, x=0, w=8, y=h,
    title="Candlestick — all four dimensions",
    description=(
        "Multi-value series pack several values into one item. The tooltip lists Open/Close/Low/High "
        "in ECharts' own data order; previously only the last dimension (High) surfaced. The header "
        "shows the real time — a multi-value item's value[0] is its data index, which used to render "
        "as 1970-01-01."
    ),
    options=echarts_opts("candlestick"),
    targets=[csv(
        "time,open,high,low,close\n"
        "2021-07-13T17:00:00Z,10,15,8,12\n"
        "2021-07-13T17:10:00Z,12,18,11,17\n"
        "2021-07-13T17:20:00Z,17,17,13,14\n"
        "2021-07-13T17:30:00Z,14,20,14,19\n"
        "2021-07-13T17:40:00Z,19,22,16,16\n"
    )],
    transformations=convert([("time", "time"), ("open", "number"), ("high", "number"),
                             ("low", "number"), ("close", "number")]),
))
panels.append(panel(
    ptype=CARTESIAN, x=8, w=8, y=h,
    title="Boxplot — five-number summary",
    description="Same expansion: Min/Q1/Median/Q3/Max instead of only Max.",
    options=echarts_opts("boxplot"),
    targets=[csv(
        "cat,min,q1,median,q3,max\n"
        "alpha,1,3,5,7,9\n"
        "bravo,2,4,6,8,10\n"
        "charlie,0,5,8,11,16\n"
    )],
    transformations=convert([("min", "number"), ("q1", "number"), ("median", "number"),
                             ("q3", "number"), ("max", "number")]),
))
panels.append(panel(
    ptype=MULTIVARIATE, x=16, w=8, y=h,
    title="Radar",
    description=(
        "Radar had no dashboard coverage at all before this one. Known cosmetic gap: every polygon "
        "is one ECharts series, so all rows share the same series name as their label instead of the "
        "per-polygon field name."
    ),
    options=echarts_opts("radar", mode="multi"),
    targets=[csv(
        "metric,alpha,bravo\n"
        "speed,80,60\n"
        "power,70,90\n"
        "range,60,75\n"
        "cost,90,50\n"
    )],
    transformations=convert([("alpha", "number"), ("bravo", "number")]),
))

h = _next_y(9)
panels.append(panel(
    ptype=PIE, x=0, w=8, y=h,
    title="Pie — All mode",
    description="Pie sets its own row emphasis, so the hovered slice bolds in All mode regardless of proximity.",
    options={"seriesType": "pie", "legend": LEGEND, "tooltip": {"mode": "multi"},
             "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}},
    targets=[csv("category,value\nSales,43\nAdmin,10\nIT,30\nMarketing,18\nSupport,7")],
    transformations=convert([("value", "number")]),
))
panels.append(panel(
    ptype=HIERARCHY, x=8, w=8, y=h,
    title="Treemap",
    description=(
        "Rows are Value / Self. No footer by design: a node aggregates a whole subtree, so there is "
        "no single field+row for data links to resolve against."
    ),
    options=echarts_opts("treemap"),
    targets=[csv("category,value\nSales,43\nAdmin,10\nIT,30\nMarketing,18\nSupport,7")],
    transformations=convert([("value", "number")]),
))
panels.append(panel(
    ptype=HEATMAP, x=16, w=8, y=h,
    title="Heatmap (matrix)",
    description=(
        "Cells now carry a colour swatch showing which bucket of the colour scale was hit. No footer: "
        "a cell aggregates a bucket spanning many rows."
    ),
    options={"seriesType": "heatmap", "heatmapLayout": "matrix", "heatmapColorScheme": "spectral",
             "legend": LEGEND, "tooltip": {"mode": "single"}},
    targets=[csv("Service,Mon,Tue,Wed,Thu,Fri\nAPI,12,19,3,5,2\nWeb,8,11,14,7,9\nDB,3,6,9,4,15\nCache,20,4,7,12,6")],
    transformations=convert([("Mon", "number"), ("Tue", "number"), ("Wed", "number"),
                             ("Thu", "number"), ("Fri", "number")]),
))

# ------------------------------------------------------------ formatting
panels.append(row("Content edge cases"))
h = _next_y(9)
panels.append(panel(
    ptype=CARTESIAN, x=0, w=8, y=h,
    title="Per-field units and decimals",
    description="Each row formats with its own field's unit/decimals override, not one shared formatter.",
    options=echarts_opts("line", mode="multi"),
    field_config={
        "defaults": {"color": {"mode": "palette-classic"}},
        "overrides": [
            {"matcher": {"id": "byName", "options": "bytes"},
             "properties": [{"id": "unit", "value": "bytes"}]},
            {"matcher": {"id": "byName", "options": "percent"},
             "properties": [{"id": "unit", "value": "percent"}, {"id": "decimals", "value": 2}]},
        ],
    },
    targets=[metric("1024,2048,4096,8192,16384", "bytes", "A"), metric("10,25,40,55,70", "percent", "B")],
))
panels.append(panel(
    ptype=CARTESIAN, x=8, w=8, y=h,
    title="All mode — hide zeros + sort desc",
    description="Zero rows drop out and remaining rows sort by value; the bold row still tracks proximity.",
    options=echarts_opts("line", mode="multi", tooltip={"sort": "desc", "hideZeros": True}),
    targets=[
        metric("10,0,30,0,50", "alpha", "A"),
        metric("0,20,25,40,0", "bravo", "B"),
        metric("5,15,0,35,45", "charlie", "C"),
    ],
))
panels.append(panel(
    ptype=CARTESIAN, x=16, w=8, y=h,
    title="Tooltip disabled (None)",
    description="No tooltip and no active-point marker; proximity work is skipped entirely.",
    options=echarts_opts("line", mode="none"),
    targets=[metric("10,25,15,30,20,35,25", "alpha", "A")],
))

dashboard = {
    "annotations": {"list": [{
        "builtIn": 1,
        "datasource": {"type": "grafana", "uid": "-- Grafana --"},
        "enable": True, "hide": True, "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts", "type": "dashboard",
    }]},
    "editable": True,
    "fiscalYearStartMonth": 0,
    "graphTooltip": 0,
    "links": [],
    "liveNow": False,
    "panels": panels,
    "refresh": "",
    "schemaVersion": 39,
    "tags": ["echarts", "tooltip", "proximity", "parity"],
    "templating": {"list": []},
    "time": {"from": "now-6h", "to": "now"},
    "timepicker": {},
    "timezone": "utc",
    "title": "ECharts Tooltip — proximity, pinning & parity",
    "uid": "echarts-tooltip-showcase",
    "version": 1,
    "weekStart": "",
}

OUT.write_text(json.dumps(dashboard, indent=2) + "\n")
subprocess.run(["npx", "prettier", "--write", str(OUT)], cwd=OUT.parent.parent.parent, check=True,
               stdout=subprocess.DEVNULL)
print(f"wrote {OUT} ({len(panels)} panels)")
