import { executeCommand } from "../processor/executeCommand.js";
import { getLogger } from "./logger.js";
const logger = getLogger(import.meta.url);
export async function writeBase64File(container, filePath, content) {
  logger.info({
    log: `Writing file to container at path: ${filePath}`,
  });
  const base64 = Buffer.from(content, "utf8").toString("base64");
  const cmd = ["sh", "-c", `echo '${base64}' | base64 -d > '${filePath}'`];
  const result = await executeCommand(container, cmd);

  if (result.exitCode !== 0) {
    logger.error({
      log: `Failed to write file: ${result.stderr}`,
    });
    throw new Error(`Failed to write to ${filePath}: ${result.stderr}`);
  }
  logger.info({
    log: `Successfully wrote file to ${filePath}`,
  });
}
