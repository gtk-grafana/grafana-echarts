// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  // ECharts is imported via its modular ESM subpaths (echarts/core, /charts, ...)
  // which, unlike the old CommonJS barrel, must be transformed for Jest. Add
  // echarts and its ESM deps (zrender, tslib) to the transform allowlist.
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, 'echarts', 'zrender', 'tslib'])],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true,
            decorators: false,
            dynamicImport: true,
          },
          transform: {
            hidden: {
              jest: true,
            },
          },
        },
        module: {
          type: 'commonjs',
        },
      },
    ],
  },
};
