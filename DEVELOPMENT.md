# Development environment

## Docker

Two stacks, deliberately independent:

| Command                | Port | What you get                                                                                                   |
| ---------------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm run server`      | 3001 | One Grafana container, TestData only. What the Playwright e2e suite runs against — keep it that way.           |
| `pnpm run server:lgtm` | 3010 | Grafana + Loki + Tempo + Prometheus + Alloy, instrumenting themselves. See [lgtm/README.md](./lgtm/README.md). |

Both can run at the same time.

## Default stack

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

## LGTM stack

`pnpm run server:lgtm` brings up Loki, Grafana, Tempo, Prometheus and Alloy on
port 3010, for developing against real data sources instead of TestData.

There is no data generator: Prometheus scrapes the five containers, Alloy tails
their stdout into Loki, and they export traces to Tempo, whose metrics-generator
feeds span metrics and service-graph edges back into Prometheus. The stack is
its own workload, so opening dashboards is what makes the numbers move.

Every committed dashboard is served here too, alongside a `LGTM stack —
self-instrumented` smoke-test dashboard. Ports, datasource uids, the reset
commands and the two services that don't trace themselves are in
[lgtm/README.md](./lgtm/README.md).
