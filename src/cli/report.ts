import type { VFileReporter } from "unified-engine";

export const jsonReporter: VFileReporter = (files) =>
  JSON.stringify({
    files: files.map((file) => ({
      path: file.path ?? "<stdin>",
      fixes: Array.isArray(file.data.slopstopperFixes)
        ? file.data.slopstopperFixes.length
        : 0,
      messages: file.messages.map((message) => ({
        reason: message.reason,
        ruleId: message.ruleId,
        source: message.source,
        line: message.line,
        column: message.column,
        endLine:
          message.place && "end" in message.place
            ? message.place.end.line
            : undefined,
        endColumn:
          message.place && "end" in message.place
            ? message.place.end.column
            : undefined,
        fatal: message.fatal ?? false,
      })),
    })),
  });
