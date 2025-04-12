import Docker from "dockerode";
import { PassThrough } from "stream";
const docker = new Docker();

export async function runCode({ language, code, input }) {
  console.log("Starting code execution:", {
    language,
    inputLength: input?.length,
  });

  let container;
  try {
    // Create container
    container = await docker.createContainer({
      Image: "gcc:latest",
      Tty: false,
      OpenStdin: true,
      HostConfig: {
        AutoRemove: true, // Auto-clean container after it stops
      },
    });

    console.log("Container created, starting...");
    await container.start();

    const sourceFile = "main.cpp";

    // Save the code
    console.log(`Writing source code to ${sourceFile}`);
    await executeCommand(container, [
      "sh",
      "-c",
      `echo '${code.replace(/'/g, "'\\''")}' > /tmp/${sourceFile}`,
    ]);

    // Save the input if provided
    if (input) {
      console.log("Writing input to input.txt");
      await executeCommand(container, [
        "sh",
        "-c",
        `echo '${input.replace(/'/g, "'\\''")}' > /tmp/input.txt`,
      ]);
    }

    console.log("Files written successfully to container");

    // Compile the code
    console.log("Compiling code...");
    const compileOutput = await executeCommand(container, [
      "g++",
      `/tmp/${sourceFile}`,
      "-o",
      "/tmp/program",
    ]);

    if (compileOutput.stderr) {
      throw new Error(`Compilation failed: ${compileOutput.stderr}`);
    }

    // Run the compiled program
    console.log("Running program...");
    const runCmd = input ? "/tmp/program < /tmp/input.txt" : "/tmp/program";
    const programOutput = await executeCommand(container, ["sh", "-c", runCmd]);
    console.log("Program output:", programOutput);
    return {
      success: true,
      output: programOutput.stdout,
      stderr: programOutput.stderr,
    };
  } catch (error) {
    console.error("Error during execution:", error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Cleanup
    if (container) {
      try {
        await container.stop();
      } catch (stopError) {
        console.log("Container already stopped", stopError);
      }
    }
  }
}

// Helper function to execute commands in container
// async function executeCommand(container, cmd) {
//   const exec = await container.exec({
//     Cmd: cmd,
//     AttachStdout: true,
//     AttachStderr: true,
//   });

//   const stream = await exec.start({ hijack: true, stdin: false });

//   return new Promise((resolve, reject) => {
//     let stdout = "";
//     let stderr = "";

//     stream.on("data", (chunk) => {
//       // Docker streams combine stdout and stderr with headers
//       // This is a simplified handling
//       const data = chunk.toString();
//       if (data.includes("stdout")) {
//         stdout += data;
//       } else {
//         stderr += data;
//       }
//     });

//     stream.on("error", (error) => {
//       console.log("Error during execution:", error);
//       reject(error);
//     });

//     stream.on("end", async () => {
//       try {
//         const inspect = await exec.inspect();
//         if (inspect.ExitCode !== 0) {
//           reject(
//             new Error(
//               `Command failed with exit code ${inspect.ExitCode}: ${stderr}`
//             )
//           );
//         } else {
//           resolve({ stdout, stderr });
//         }
//       } catch (error) {
//         reject(error);
//       }
//     });
//   });
// }
async function executeCommand(container, cmd) {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    container.modem.demuxStream(stream, stdout, stderr);

    let stdoutData = "";
    let stderrData = "";

    stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    stream.on("end", async () => {
      try {
        const inspect = await exec.inspect();
        if (inspect.ExitCode !== 0) {
          reject(
            new Error(
              `Command failed with exit code ${inspect.ExitCode}: ${stderrData}`
            )
          );
        } else {
          resolve({ stdout: stdoutData, stderr: stderrData });
        }
      } catch (error) {
        reject(error);
      }
    });

    stream.on("error", reject);
  });
}
