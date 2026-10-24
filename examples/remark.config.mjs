import stopslop from "remark-lint-stopslop/remark";

export default {
  plugins: [[stopslop, { options: { preset: "low-density" } }]],
};
