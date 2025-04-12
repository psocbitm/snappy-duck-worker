import Docker from "dockerode";
import { PassThrough } from "stream";
const docker = new Docker();

/**
 * Executes C++ code inside a Docker container and returns the output.
 * @param {Object} params - Parameters for code execution
 * @param {string} params.language - Programming language (e.g., "cpp")
 * @param {string} params.code - C++ source code to execute
 * @param {string} [params.input] - Optional input for the program
 * @returns {Promise<Object>} Execution result with success status, output, and error
 */
export async function runCode({ language, code, input }) {
  let container;
  try {
    // Validate input parameters
    if (language !== "cpp" || !code) {
      throw new Error("Invalid language or missing code");
    }

    // Create container with auto-remove enabled
    container = await docker.createContainer({
      Image: "gcc:latest",
      Tty: false,
      OpenStdin: true,
      HostConfig: { AutoRemove: true },
    });

    await container.start();

    const sourceFile = "/tmp/main.cpp";
    const inputFile = "/tmp/input.txt";
    const programFile = "/tmp/program";

    // Write code to file in container
    await executeCommand(container, [
      "sh",
      "-c",
      `echo '${code.replace(/'/g, "'\\''")}' > ${sourceFile}`,
    ]);

    // Write input to file if provided
    if (input) {
      await executeCommand(container, [
        "sh",
        "-c",
        `echo '${input.replace(/'/g, "'\\''")}' > ${inputFile}`,
      ]);
    }

    // Compile the C++ code
    const compileOutput = await executeCommand(container, [
      "g++",
      sourceFile,
      "-o",
      programFile,
    ]);

    if (compileOutput.exitCode !== 0) {
      return {
        success: false,
        error: `Compilation failed: ${compileOutput.stderr}`,
      };
    }

    // Run the compiled program
    const runCmd = input ? `${programFile} < ${inputFile}` : programFile;
    const programOutput = await executeCommand(container, ["sh", "-c", runCmd]);

    // Return result immediately
    return {
      success: true,
      output: programOutput.stdout,
      error: programOutput.stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Stop container in the background without awaiting
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
    stream.on("end", async () => {
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
    stream.on("error", reject);
  });
}
