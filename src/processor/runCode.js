import Docker from "dockerode";
import { languageConfigs } from "../config/languageConfig.js";
import { executeCommand } from "./executeCommand.js";
import { setFilePermissions } from "../utils/setFilePermissions.js";
import { writeBase64File } from "../utils/writeBase64File.js";
import { getOutput } from "./getOutput.js";
import { getLogger } from "../utils/logger.js";
const logger = getLogger(import.meta.url);

const docker = new Docker();

export async function runCode({ language, code, input }) {
  logger.info({
    log: "Running code",
    language: language,
    input: input,
  });
  const config = languageConfigs[language];
  if (!config) {
    logger.error({
      log: "Unsupported language requested",
      language: language,
    });
    return { success: false, error: `Unsupported language: ${language}` };
  }

  const sourceFile = `/tmp/${config.sourceFileName}`;
  const inputFile = "/tmp/input.txt";
  const programFile = language === "cpp" ? "/tmp/program" : null;

  let container;

  try {
    logger.info({
      log: "Creating container with image",
      image: config.image,
    });
    container = await docker.createContainer({
      Image: config.image,
      Tty: false,
      OpenStdin: true,
      WorkingDir: "/tmp",
      HostConfig: {
        AutoRemove: true,
        Memory: 512 * 1024 * 1024, // 512MB
        CpuPeriod: 100000,
        CpuQuota: 50000, // 50% CPU
      },
    });

    await container.start();
    logger.info({
      log: "Container started successfully",
    });

    // Step 1: Write code and input files
    await writeBase64File(container, sourceFile, code);
    if (input) {
      await writeBase64File(container, inputFile, input);
    }

    await setFilePermissions(container, sourceFile, "644");
    if (input) {
      await setFilePermissions(container, inputFile, "644");
    }

    // Step 2: Compile (if necessary)
    if (config.compile) {
      logger.info({
        log: "Compiling code...",
      });
      const compileCmd = config.compile(sourceFile, programFile);
      const compileResult = await executeCommand(container, compileCmd);
      if (compileResult.exitCode !== 0) {
        logger.error({
          log: "Compilation failed",
          error: compileResult.stderr,
        });
        return {
          success: false,
          error: `Compilation failed:\n${compileResult.stderr.trim()}`,
        };
      }
      logger.info({
        log: "Compilation successful",
      });

      if (programFile) {
        await setFilePermissions(container, programFile, "755");
      }
    }

    // Step 3: Execute code
    logger.info({
      log: "Executing code...",
    });
    const runCommand = config.run(sourceFile, programFile);
    const fullCommand = input
      ? `timeout 1s ${runCommand} < ${inputFile}`
      : `timeout 1s ${runCommand}`;

    const execResult = await executeCommand(container, [
      "sh",
      "-c",
      fullCommand,
    ]);
    logger.info({
      log: "Code execution completed:",
      exitCode: execResult.exitCode,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
    });

    // Step 4: Return output immediately
    return getOutput(execResult);
  } catch (err) {
    logger.error({
      log: "Unhandled error during code execution:",
      error: err,
    });
    return {
      success: false,
      error: `Unhandled error: ${err.message || err}`,
    };
  } finally {
    // Stop container asynchronously — don't wait
    if (container) {
      logger.info({
        log: "Stopping container...",
      });
      container.stop().catch((err) => {
        logger.warn({
          log: "Non-critical: Error stopping container",
          error: err.message,
        });
      });
    }
  }
}
