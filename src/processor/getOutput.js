export function getOutput(execResult) {
  switch (execResult.exitCode) {
    case 0:
      return {
        success: true,
        output: execResult.stdout,
        error: execResult.stderr.trim(),
      };
    case 124:
      return {
        success: false,
        output: execResult.stdout,
        error: "Execution timed out after 1s",
      };
    case 143:
      return {
        success: false,
        output: execResult.stdout,
        error: "SIGTERM",
      };
    default:
      return {
        success: false,
        output: execResult.stdout,
        error: execResult.stderr.trim() || "Something went wrong",
      };
  }
}
