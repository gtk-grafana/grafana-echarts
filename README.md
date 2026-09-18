# ECharts panels for Grafana

This repository contains Grafana panels that use Apache ECharts. It also contains the standalone ECharts Relations panel.

ECharts Relations displays connected data as a graph, Sankey diagram, or chord diagram. It uses Grafana field configuration, tooltips, data links, value mappings, and color schemes.

![ECharts Relations presets](https://raw.githubusercontent.com/gtk-grafana/grafana-echarts/main/src/modules/relations/img/relations-presets.png)

## Data requirements

The panel reads wide data frames. Each numeric edge field defines one edge and needs labels that identify its source and target.

If a data source returns row-based data, use the data source guide to convert it to wide data.

For query examples, read the [data source guide](https://github.com/gtk-grafana/grafana-echarts/blob/main/docs/relations-data-sources.md).

## Development

Install the dependencies:

```sh
pnpm install
```

Build all panels:

```sh
pnpm run build
```

Build only the standalone Relations panel:

```sh
pnpm run build:relations
```

Run the test suite:

```sh
pnpm run test:ci
```

Run Grafana with TestData on port 3001:

```sh
pnpm run server
```

Run the LGTM development stack on port 3010:

```sh
pnpm run server:lgtm
```

Run the standalone Relations panel on port 4001:

```sh
pnpm run server:relations
```

## Documentation

- [Relations data source guide](https://github.com/gtk-grafana/grafana-echarts/blob/main/docs/relations-data-sources.md)
- [Relations data format reference](https://github.com/gtk-grafana/grafana-echarts/blob/main/data-plane/graph-wide.md)

## License

This project uses the [Apache License 2.0](https://github.com/gtk-grafana/grafana-echarts/blob/main/LICENSE).
