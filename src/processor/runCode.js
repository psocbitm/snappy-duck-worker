import Docker from "dockerode";
import { PassThrough } from "stream";
import { languageConfigs } from "../config/languageConfig.js";

const docker = new Docker();

/**
 * Executes code in the specified language inside a Docker container.
 * @param {Object} params - Parameters for code execution
 * @param {string} params.language - Programming language ("cpp", "java", "javascript", "python")
 * @param {string} params.code - Source code to execute
 * @param {string} [params.input] - Optional input for the program
 * @returns {Promise<Object>} Execution result with success status, output, and error
 */
export async function runCode({ language, code, input }) {
  const config = languageConfigs[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  let container;
  try {
    // Create container with auto-remove enabled for cleanup and resource limits
    container = await docker.createContainer({
      Image: config.image,
      Tty: false,
      OpenStdin: true,
      HostConfig: {
        AutoRemove: true,
        Memory: 512 * 1024 * 1024, // 512MB memory limit
        CpuPeriod: 100000,
        CpuQuota: 50000, // 50% CPU limit
      },
      WorkingDir: "/tmp", // Set working directory explicitly
    });

    await container.start();

    const sourceFile = `/tmp/${config.sourceFileName}`;
    const inputFile = "/tmp/input.txt";
    const programFile = language === "cpp" ? "/tmp/program" : null;

    // Write code to sourceFile using base64 to handle special characters
    const codeBase64 = Buffer.from(code).toString("base64");
    await executeCommand(container, [
      "sh",
      "-c",
      `echo '${codeBase64}' | base64 -d > ${sourceFile}`,
    ]);

    // Write input to inputFile if provided
    if (input) {
      const inputBase64 = Buffer.from(input).toString("base64");
      await executeCommand(container, [
        "sh",
        "-c",
        `echo '${inputBase64}' | base64 -d > ${inputFile}`,
      ]);
    }

    // Set appropriate file permissions
    await executeCommand(container, ["chmod", "644", sourceFile]);
    if (input) {
      await executeCommand(container, ["chmod", "644", inputFile]);
    }

    // Compile if necessary (C++ and Java)
    if (config.compile) {
      const compileCmd = config.compile(sourceFile, programFile);
      const compileOutput = await executeCommand(container, compileCmd);
      if (compileOutput.exitCode !== 0) {
        return {
          success: false,
          error: `Compilation failed: ${compileOutput.stderr}`,
        };
      }
      // Set executable permissions for compiled programs
      if (programFile) {
        await executeCommand(container, ["chmod", "755", programFile]);
      }
    }

    // Run the program with optional input redirection and timeout
    const runCmdBase = config.run(sourceFile, programFile);
    const runCmd = input
      ? `timeout 5s ${runCmdBase} < ${inputFile}`
      : `timeout 5s ${runCmdBase}`;
    const programOutput = await executeCommand(container, ["sh", "-c", runCmd]);

    if (programOutput.exitCode === 124) {
      // timeout exit code
      return {
        success: false,
        error: "Execution timed out after 5 seconds",
      };
    }

    // Return execution result
    return {
      success: programOutput.exitCode === 0,
      output: programOutput.stdout,
      error: programOutput.stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Stop and remove container in the background
    if (container) {
      container.stop().catch((err) => {
        console.error("Error stopping container:", err);
      });
    }
  }
}

/**
 * Executes a command inside a Docker container and captures output.
 * @param {Docker.Container} container - The Docker container instance
 * @param {string[]} cmd - Command array to execute
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>} Command output and exit code
 */
async function executeCommand(container, cmd) {
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
      reject(new Error("Command execution timed out"));
    }, 10000); // 10 second timeout

    stream.on("end", async () => {
      clearTimeout(timeout);
      try {
        const { ExitCode } = await exec.inspect();
        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: ExitCode,
        });
      } catch (error) {
        reject(error);
      }
    });

    stream.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
