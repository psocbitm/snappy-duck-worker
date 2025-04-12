import { executeCommand } from "../processor/executeCommand.js";
import { getLogger } from "./logger.js";
const logger = getLogger(import.meta.url);
export async function setFilePermissions(container, path, mode) {
  logger.info({
    log: `Setting permissions ${mode} on ${path}`,
  });
  const result = await executeCommand(container, ["chmod", mode, path]);
  if (result.exitCode !== 0) {
    logger.error({
      log: `Failed to set permissions: ${result.stderr}`,
    });
    throw new Error(`Failed to chmod ${path}: ${result.stderr}`);
  }
  logger.info({
    log: `Successfully set permissions on ${path}`,
  });
}
