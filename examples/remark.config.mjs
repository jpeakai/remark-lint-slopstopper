import docLint from "remark-lint-stopslop/remark";

export default {
  plugins: [[docLint, { options: { preset: "low-density" } }]],
};
