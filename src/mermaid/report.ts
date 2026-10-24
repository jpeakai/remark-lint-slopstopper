import type { RuleId } from "../types.ts";

export type Report = (rule: RuleId, message: string, line?: number) => void;
