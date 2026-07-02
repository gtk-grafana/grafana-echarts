Each module in this "modules" directory displays as a separate panel plugin, but can be managed in the same repo with the same dependencies.
This is possible because Grafana app plugins support nested sub-modules.

To help keep imports from piggy backing in the module.tsx files, split constants and types into dedicated files
