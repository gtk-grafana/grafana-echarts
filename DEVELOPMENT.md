# Development environment

## Docker

`pnpm run server` will spin up a docker image with default settings on port 3001.

To run multiple instances (e.g. different Grafana versions on different ports to help debug version specific issues), just vary the port. The container name defaults to `grafana-echarts-panel-<GRAFANA_PORT>`, so each instance stays isolated:

```bash
GRAFANA_VERSION=13.1.0 GRAFANA_PORT=3002 pnpm run server
GRAFANA_VERSION=12.4.5 GRAFANA_PORT=3003 pnpm run server
```

Set `GRAFANA_CONTAINER_NAME` if you want to override the generated name:

```bash
GRAFANA_VERSION=13.1.0 GRAFANA_PORT=3002 GRAFANA_CONTAINER_NAME=grafana-echarts-panel-13 pnpm run server
```
