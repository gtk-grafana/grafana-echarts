// Root webpack config that extends the scaffolded `.config` webpack config
// (which must not be edited). See:
// https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations#extend-the-webpack-config
//
import CopyWebpackPlugin from 'copy-webpack-plugin';
import fs from 'fs';
import path from 'path';
import ReplaceInFileWebpackPlugin from 'replace-in-file-webpack-plugin';
import webpack, { type Configuration } from 'webpack';
// https://github.com/webpack-contrib/webpack-bundle-analyzer
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import VirtualModulesPlugin from 'webpack-virtual-modules';

import baseConfig, { type Env } from './/.config/webpack/webpack.config.ts';

type PluginManifest = {
  id: string;
  info?: {
    logos?: {
      large?: string;
      small?: string;
    };
    screenshots?: Array<{ path: string }>;
  };
};

type PackageMetadata = {
  version: string;
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

const standalonePluginKinds = [
  { name: 'BannerPlugin', matches: (plugin: unknown) => plugin instanceof webpack.BannerPlugin },
  { name: 'CopyWebpackPlugin', matches: (plugin: unknown) => plugin instanceof CopyWebpackPlugin },
  {
    name: 'ReplaceInFileWebpackPlugin',
    matches: (plugin: unknown) => plugin instanceof ReplaceInFileWebpackPlugin,
  },
  { name: 'VirtualModulesPlugin', matches: (plugin: unknown) => plugin instanceof VirtualModulesPlugin },
];

const standaloneCopyPatterns = (manifest: PluginManifest) => {
  const moduleDirectory = 'modules/relations';
  const assetPaths = Array.from(
    new Set([
      manifest.info?.logos?.small,
      manifest.info?.logos?.large,
      ...(manifest.info?.screenshots?.map(({ path: screenshotPath }) => screenshotPath) ?? []),
    ])
  ).filter((assetPath): assetPath is string => Boolean(assetPath));

  for (const assetPath of assetPaths) {
    const sourcePath = path.resolve(process.cwd(), 'src', moduleDirectory, assetPath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Relations manifest asset does not exist: ${assetPath}`);
    }
  }

  return [
    { from: `${moduleDirectory}/plugin.json`, to: 'plugin.json' },
    ...assetPaths.map((assetPath) => ({ from: `${moduleDirectory}/${assetPath}`, to: assetPath })),
    { from: 'README.md', to: '.', force: true },
    { from: '../CHANGELOG.md', to: '.', force: true },
    { from: '../LICENSE', to: '.' },
  ];
};

const replaceStandalonePlugins = (
  plugins: NonNullable<Configuration['plugins']>,
  manifest: PluginManifest,
  packageVersion: string
): NonNullable<Configuration['plugins']> => {
  for (const pluginKind of standalonePluginKinds) {
    const count = plugins.filter(pluginKind.matches).length;
    if (count !== 1) {
      throw new Error(`Expected one scaffold ${pluginKind.name}, found ${count}.`);
    }
  }

  const retainedPlugins = plugins.filter(
    (plugin) => !standalonePluginKinds.some((pluginKind) => pluginKind.matches(plugin))
  );
  const virtualPublicPath = new VirtualModulesPlugin({
    'node_modules/grafana-public-path.js': `
import amdMetaModule from 'amd-module';

__webpack_public_path__ =
  amdMetaModule && amdMetaModule.uri
    ? amdMetaModule.uri.slice(0, amdMetaModule.uri.lastIndexOf('/') + 1)
    : 'public/plugins/${manifest.id}/';
`,
  });

  return [
    ...retainedPlugins,
    virtualPublicPath,
    new webpack.BannerPlugin({
      banner: `/* [create-plugin] plugin: ${manifest.id}@${packageVersion} */`,
      raw: true,
      entryOnly: true,
    }),
    new CopyWebpackPlugin({ patterns: standaloneCopyPatterns(manifest) }),
    new ReplaceInFileWebpackPlugin([
      {
        dir: 'dist',
        test: [/(^|\/)plugin\.json$/, /(^|\/)README\.md$/],
        rules: [
          { search: /\%VERSION\%/g, replace: packageVersion },
          { search: /\%TODAY\%/g, replace: new Date().toISOString().substring(0, 10) },
          { search: /\%PLUGIN_ID\%/g, replace: manifest.id },
        ],
      },
    ]),
  ];
};

const config = async (env: Env): Promise<Configuration> => {
  if (env.standalone !== undefined && env.standalone !== 'relations') {
    throw new Error(`Unsupported standalone target "${String(env.standalone)}". Supported targets: relations.`);
  }

  const base = await baseConfig(env);
  const isRelationsStandalone = env.production && env.standalone === 'relations';
  const rootManifest = readJson<PluginManifest>(path.resolve(process.cwd(), 'src/plugin.json'));
  const relationsManifest = readJson<PluginManifest>(path.resolve(process.cwd(), 'src/modules/relations/plugin.json'));
  const packageMetadata = readJson<PackageMetadata>(path.resolve(process.cwd(), 'package.json'));
  const activePluginId = isRelationsStandalone ? relationsManifest.id : rootManifest.id;

  if (isRelationsStandalone) {
    base.entry = {
      module: path.resolve(process.cwd(), 'src/modules/relations/module.tsx'),
    };
    base.output = {
      ...base.output,
      publicPath: `public/plugins/${relationsManifest.id}/`,
      uniqueName: relationsManifest.id,
    };
  }

  // De-duplicate the ECharts runtime across the nested panel entries. Each
  // panel registers a React.lazy wrapper (see lib/components/LazyPanel), so the
  // Panel and its ECharts import only ever live in async chunks; this cacheGroup
  // collapses the ECharts/zrender modules shared by those async chunks into a
  // single `echarts` chunk emitted once (the shared Panel code is likewise
  // de-duplicated by webpack's default async cacheGroup).
  //
  // Only `async` chunks are split: Grafana's plugin loader fetches just each
  // entry `module.js`, and webpack's runtime lazy-loads async chunks via the
  // dynamic publicPath. Splitting `initial` chunks would instead emit sibling
  // chunks that Grafana never loads, leaving the panel factory waiting forever.
  base.optimization = {
    ...base.optimization,
    splitChunks: {
      chunks: 'async',
      cacheGroups: {
        echarts: {
          test: /[\\/]node_modules[\\/](\.pnpm[\\/].*[\\/])?(echarts|zrender)[\\/]/,
          name: 'echarts',
          chunks: 'async',
          enforce: true,
        },
      },
    },
  };

  const configuredPlugins = isRelationsStandalone
    ? replaceStandalonePlugins(base.plugins ?? [], relationsManifest, packageMetadata.version)
    : [
        ...(base.plugins ?? []),
        new CopyWebpackPlugin({
          patterns: [
            // Nested manifests reference logos that the scaffold copy step omits.
            { from: 'modules/*/img/**', to: '[path][name][ext]', noErrorOnMissing: true },
          ],
        }),
      ];

  base.plugins = [
    ...configuredPlugins,
    new webpack.DefinePlugin({
      __PLUGIN_ID__: JSON.stringify(activePluginId),
    }),
    // Enabled via `pnpm run build:analyze` (passes `--env analyze`). Writes a
    // static report so the build stays non-interactive and CI-friendly.
    ...(env.analyze ? [new BundleAnalyzerPlugin({ analyzerMode: 'static', openAnalyzer: false })] : []),
  ];

  return base;
};

export default config;
