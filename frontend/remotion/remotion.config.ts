import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind';

Config.overrideWebpackConfig((currentConfiguration) => {
  return enableTailwind(currentConfiguration, {
    configLocation: './remotion/tailwind.config.js',
    cssLocation: './remotion/style.css',
  });
});
