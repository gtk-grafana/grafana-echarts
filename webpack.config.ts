// Root webpack config that extends the scaffolded `.config` webpack config
// (which must not be edited). See:
// https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations#extend-the-webpack-config
//
// The only extension is copying each nested panel's `img/` assets to dist. The
// scaffolded copyFiles step copies the root logo and every JSON file, but not
// the nested `.svg` logos referenced by each nested `plugin.json`.
import CopyWebpackPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';
// https://github.com/webpack-contrib/webpack-bundle-analyzer
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';

import baseConfig, { type Env } from './/.config/webpack/webpack.config.ts';

const config = async (env: Env): Promise<Configuration> => {
  const base = await baseConfig(env);

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

  base.plugins = [
    ...(base.plugins ?? []),
    new CopyWebpackPlugin({
      patterns: [
        // Context defaults to the compiler context (`src`), so this matches
        // `src/<family>/img/...` and excludes the root `src/img` (already
        // copied via the base config's logo patterns).
        { from: '*/img/**', to: '[path][name][ext]', noErrorOnMissing: true },
      ],
    }),
    // Enabled via `pnpm run build:analyze` (passes `--env analyze`). Writes a
    // static report so the build stays non-interactive and CI-friendly.
    ...(env.analyze ? [new BundleAnalyzerPlugin({ analyzerMode: 'static', openAnalyzer: false })] : []),
  ];

  return base;
};

export default config;
