// Root webpack config that extends the scaffolded `.config` webpack config
// (which must not be edited). See:
// https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations#extend-the-webpack-config
//
// The only extension is copying each nested panel's `img/` assets to dist. The
// scaffolded copyFiles step copies the root logo and every JSON file, but not
// the nested `.svg` logos referenced by each nested `plugin.json`.
import CopyWebpackPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';

import baseConfig, { type Env } from './.config/webpack/webpack.config.ts';

const config = async (env: Env): Promise<Configuration> => {
  const base = await baseConfig(env);

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
  ];

  return base;
};

export default config;
