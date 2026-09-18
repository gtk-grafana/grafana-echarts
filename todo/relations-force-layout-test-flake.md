# Relations force-layout test flake

## Status

The full Jest run can fail `keeps one mounted graph inside the final rectangle after a resize burst` in `layout.integration.test.tsx`.
The same suite passes when it runs alone with one worker.

## Evidence

On 2026-09-18, two full runs placed one node 2.60 pixels and 1.67 pixels above the plot boundary.
The isolated suite passed all 12 tests between those runs.

## Follow-up

Make the force-layout result deterministic or change the assertion to account for the supported layout tolerance.
Do not weaken the boundary claim without checking the rendered output.
