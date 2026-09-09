# LGTM development stack

Loki, Grafana, Tempo and Prometheus in Docker, for developing the panels
against **real data sources** instead of TestData.

```sh
pnpm run build          # docker serves ./dist; rebuild before you look
pnpm run server:lgtm    # http://localhost:3010
```

Separate from `pnpm run server`, which stays a single Grafana container with
nothing but TestData behind it because the Playwright e2e suite depends on it.
Both can run at once — different ports, different Compose project.

## The stack instruments itself

There is no log generator and no synthetic metrics. Every signal is produced by
the five containers doing their normal work, so the numbers move because
_Grafana ran a query_, not because a fixture said so:

| Signal      | Source                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Metrics** | Prometheus scrapes `/metrics` on all five containers, itself included                                                       |
| **Logs**    | Alloy tails all five containers' stdout over the Docker socket → Loki                                                       |
| **Traces**  | Grafana, Prometheus and Alloy export OTLP → Tempo ([two exceptions](#known-gaps-in-tracing))                                |
| **Derived** | Tempo's metrics-generator turns those traces into span metrics and service-graph edges, remote-written back into Prometheus |

The corollary: **a quiet stack is a flat dashboard.** Open a few dashboards or
pan the time picker to give it something to measure.

This is the deliberate difference from
[logs-drilldown](https://github.com/grafana/logs-drilldown), whose compose files
this is otherwise modelled on. Its `generator` service — a Go program that
synthesises log and trace traffic — is not vendored here; the stack's own output
is the input instead.

### Why this stack is useful to this repo specifically

Tempo's metrics-generator publishes `traces_service_graph_request_total` with
`client` and `server` labels — a real source/target pair. That is exactly the
metric `provisioning/dashboards/relations/devcortex-*.json` are written against,
so the **relations** panels (graph / sankey / chord) have live data locally
instead of needing a cluster. `dashboards/lgtm-stack.json` uses the same
`label_replace` query shape as `devcortex-wide.json`.

## What runs where

| Service    | URL                    | Port var          |
| ---------- | ---------------------- | ----------------- |
| Grafana    | http://localhost:3010  | `GRAFANA_PORT`    |
| Loki       | http://localhost:3100  | `LOKI_PORT`       |
| Tempo      | http://localhost:3200  | `TEMPO_PORT`      |
| Prometheus | http://localhost:9090  | `PROMETHEUS_PORT` |
| Alloy UI   | http://localhost:12345 | `ALLOY_PORT`      |

Tempo's OTLP ingest is published too (`4317` gRPC / `4318` HTTP,
`TEMPO_OTLP_GRPC_PORT` / `TEMPO_OTLP_HTTP_PORT`), so you can push traces from
something on the host as well.

Image versions come from `GRAFANA_VERSION` (`.env`), `LOKI_VERSION`,
`TEMPO_VERSION`, `PROMETHEUS_VERSION` and `ALLOY_VERSION`.

## Dashboards and datasources

Grafana gets its provisioning from `lgtm/provisioning` rather than the repo's
`provisioning/`, because it needs its own datasources. It still serves **every
committed dashboard**: `docker-compose-lgtm.yaml` also mounts
`provisioning/dashboards` read-only, and `provisioning/dashboards/default.yaml`
here registers a second provider over it. TestData is still provisioned, still
under the same uid, and still the default, so nothing in that tree changes
behaviour in this stack.

Datasource uids are `lgtm-prometheus`, `lgtm-loki` and `lgtm-tempo`, wired to
each other: exemplars → Tempo, `traceID=` in a log line → Tempo, Tempo span →
its service's logs and metrics, and the Tempo service map → Prometheus.

**`dashboards/lgtm-stack.json`** is the smoke test — if its five panels have
data, all four signals are wired.

## Known gaps in tracing

Metrics and logs come from all five services. Traces come from three: Grafana,
Prometheus and Alloy. Both exceptions are about the _services' own_ spans —
neither affects the traces Tempo receives, the metrics-generator, or the service
graph.

**Loki can't** — 3.6.5 through at least 3.7.6 fail tracer init with `conflicting
Schema URL`, an OpenTelemetry semconv skew in dskit, not a config problem
([grafana/loki#21588](https://github.com/grafana/loki/issues/21588); the fix,
[#21742](https://github.com/grafana/loki/pull/21742), is unreleased).
`LOKI_VERSION=3.6.4 pnpm run server:lgtm` is the newest version whose tracer
initialises, if you need Loki's spans before the fix lands.

**Tempo deliberately doesn't** — it is the only OTLP endpoint in the stack, so
self-tracing means exporting to itself. Its receiver stops before its tracer
does, so the last flush retries against a dead socket and Tempo either times out
into `os.Exit(1)` or hangs until SIGKILL; both were measured on the same config.
Relaying through Alloy to break the loop is worse — Compose does not reliably
keep Alloy alive past its dependents, so two containers get killed instead of
one. Turning it off also makes span metrics honest: Tempo was otherwise emitting
spans about ingesting its own spans, which dominated the totals.

## Stopping and resetting

Compose needs the project name, which `pnpm run server:lgtm` derives from the
port:

```sh
docker compose -p grafana-echarts-panel-lgtm-3010 -f docker-compose-lgtm.yaml down     # stop, keep data
docker compose -p grafana-echarts-panel-lgtm-3010 -f docker-compose-lgtm.yaml down -v  # and drop the volumes
```

Loki, Tempo and Prometheus data lives in named volumes, so a restart keeps the
history — worth knowing when a panel shows data older than the container.
