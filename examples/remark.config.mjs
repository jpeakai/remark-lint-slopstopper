import slopstopper from "remark-lint-slopstopper/remark";

export default {
  plugins: [[slopstopper, { options: { preset: "low-density" } }]],
};
