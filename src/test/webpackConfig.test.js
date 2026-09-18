const path = require('path');

const config = require('../../webpack.config').default;

const pluginsNamed = (plugins, name) => plugins.filter((plugin) => plugin?.constructor.name === name);

describe('webpack configuration', () => {
  it('builds the Relations panel as the only standalone entry', async () => {
    const standalone = await config({ production: true, standalone: 'relations' });

    expect(standalone.entry).toEqual({
      module: path.resolve(process.cwd(), 'src/modules/relations/module.tsx'),
    });
    expect(standalone.output).toEqual(
      expect.objectContaining({
        filename: '[name].js',
        publicPath: 'public/plugins/grafana-echarts-relations-panel/',
        uniqueName: 'grafana-echarts-relations-panel',
      })
    );
  });

  it('rejects unsupported standalone targets', async () => {
    await expect(config({ production: true, standalone: 'unknown' })).rejects.toThrow(
      'Unsupported standalone target "unknown". Supported targets: relations.'
    );
  });

  it('keeps all discovered entries in the default build', async () => {
    const defaultConfig = await config({ production: true });

    expect(Object.keys(defaultConfig.entry).sort()).toEqual([
      'module',
      'modules/cartesian/module',
      'modules/heatmap/module',
      'modules/hierarchy/module',
      'modules/multivariate/module',
      'modules/part-to-whole/module',
      'modules/relations/module',
      'modules/stream/module',
    ]);
    expect(defaultConfig.output).toEqual(
      expect.objectContaining({
        publicPath: 'public/plugins/grafana-echarts-app/',
        uniqueName: 'grafana-echarts-app',
      })
    );
  });

  it('copies only Relations release files in standalone mode', async () => {
    const standalone = await config({ production: true, standalone: 'relations' });
    const copyPlugins = pluginsNamed(standalone.plugins ?? [], 'CopyPlugin');

    expect(copyPlugins).toHaveLength(1);
    expect(copyPlugins[0]).toEqual(
      expect.objectContaining({
        patterns: [
          { from: 'modules/relations/plugin.json', to: 'plugin.json' },
          { from: 'modules/relations/img/logo.svg', to: 'img/logo.svg' },
          { from: 'modules/relations/img/relations-presets.png', to: 'img/relations-presets.png' },
          { from: 'modules/relations/img/relations-timeline.png', to: 'img/relations-timeline.png' },
          { from: 'README.md', to: '.', force: true },
          { from: '../CHANGELOG.md', to: '.', force: true },
          { from: '../LICENSE', to: '.' },
        ],
      })
    );
  });
});
