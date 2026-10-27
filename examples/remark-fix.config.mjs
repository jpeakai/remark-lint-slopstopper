import config from "./remark.config.mjs";

const [plugin, options] = config.plugins.at(-1);

export default {
  plugins: [...config.plugins.slice(0, -1), [plugin, { ...options, fix: true }]],
};
