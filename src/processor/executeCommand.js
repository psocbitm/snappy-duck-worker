import { PassThrough } from "stream";
import { getLogger } from "../utils/logger.js";
const logger = getLogger(import.meta.url);
export async function executeCommand(container, cmd) {
  logger.info({
    log: `Executing command in container:`,
    cmd: cmd,
  });
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  const stdout = new PassThrough();
  const stderr = new PassThrough();

  container.modem.demuxStream(stream, stdout, stderr);

  let stdoutData = "";
  let stderrData = "";

  stdout.on("data", (chunk) => (stdoutData += chunk.toString()));
  stderr.on("data", (chunk) => (stderrData += chunk.toString()));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.destroy();
      logger.error({
        log: "Docker command timed out after 10s",
      });
      reject(new Error("Docker command timed out"));
    }, 10000); // 10s hard limit

    stream.on("end", async () => {
      clearTimeout(timeout);
      try {
        const { ExitCode } = await exec.inspect();
        logger.info({
          log: `Command completed with exit code: ${ExitCode}`,
        });
        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: ExitCode,
        });
      } catch (inspectErr) {
        logger.error({
          log: `Failed to inspect exec: ${inspectErr.message}`,
        });
        reject(new Error(`Failed to inspect exec: ${inspectErr.message}`));
      }
    });

    stream.on("error", (err) => {
      clearTimeout(timeout);
      logger.error({
        log: `Stream error: ${err.message}`,
      });
      reject(err);
    });
  });
}
