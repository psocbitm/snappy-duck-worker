import Docker from "dockerode";
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function runCode({ code, language, input }) {
  console.info("Starting code execution with language:", language);
  let container;
  try {
    const languageConfigs = {
      cpp: {
        image: "gcc:latest",
        ext: "cpp",
        compileCmd: "g++ code.cpp -o code",
        runCmd: "./code",
      },
      java: {
        image: "openjdk:latest",
        ext: "java",
        compileCmd: "javac Main.java",
        runCmd: "java Main",
        filename: "Main.java",
      },
      python: {
        image: "python:slim",
        ext: "py",
        compileCmd: null,
        runCmd: "python code.py",
      },
      javascript: {
        image: "node:slim", // Changed from slim to latest for better compatibility
        ext: "js",
        compileCmd: null,
        runCmd: "node code.js",
      },
    };

    if (!languageConfigs[language]) {
      console.info("Unsupported language requested:", language);
      throw new Error(
        "Unsupported language. Supported languages: cpp, java, python, javascript"
      );
    }

    const config = languageConfigs[language];
    const containerFileName = config.filename || `code.${config.ext}`;
    const execCmd = [config.compileCmd, config.runCmd].filter(Boolean);
    console.info("Using container file name:", containerFileName);
    console.info("Execution commands:", execCmd);

    // Create container
    console.info("Creating container with image:", config.image);
    container = await docker.createContainer({
      Image: config.image,
      Tty: false, // Changed to false for better stream handling
      OpenStdin: true,
      StdinOnce: true,
      WorkingDir: "/app",
      HostConfig: {
        Memory: 512 * 1024 * 1024,
        AutoRemove: true,
      },
    });

    // Start container
    console.info("Starting container");
    await container.start();

    // Copy code to container
    console.info("Copying code to container");
    const codeCommand = `echo "${Buffer.from(code).toString(
      "base64"
    )}" | base64 -d > /app/${containerFileName}`;
    await execContainerCommand(container, ["bash", "-c", codeCommand]);

    // Execute the code
    console.info("Creating execution environment");
    const exec = await container.exec({
      Cmd: ["bash", "-c", execCmd.join(" && ")],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    console.info("Executing code and waiting for output");
    const output = await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      exec.start({ hijack: true, stdin: true }, (err, stream) => {
        if (err) return reject(err);

        // Handle stream events
        docker.modem.demuxStream(
          stream,
          {
            write: (data) => {
              stdout += data.toString();
            },
          },
          {
            write: (data) => {
              stderr += data.toString();
            },
          }
        );

        // Write input and close stdin
        if (input) {
          console.info("Writing input to container");
          stream.write(input);
        }
        stream.end();

        stream.on("end", () => {
          console.info("Stream ended, resolving output");
          resolve(stdout || stderr);
        });
        stream.on("error", (error) => {
          console.info("Stream error occurred:", error.message);
          reject(new Error(`Stream error: ${error.message}`));
        });
      });
    });

    console.info("Execution completed successfully");
    console.log("Execution Output:", output);
    return output;
  } catch (error) {
    console.error("Error executing code:", error.message);
    throw error;
  } finally {
    // Ensure container cleanup if not auto-removed
    if (container) {
      console.info("Cleaning up container");
      try {
        await container.stop();
      } catch (e) {
        // Ignore stop errors as container might already be removed
        console.info("Container already removed or stopped", e);
      }
    }
  }
}

async function execContainerCommand(container, cmd) {
  console.info("Executing container command:", cmd);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  return new Promise((resolve, reject) => {
    exec.start({ hijack: true }, (err, stream) => {
      if (err) return reject(err);

      let output = "";
      docker.modem.demuxStream(
        stream,
        {
          write: (data) => {
            output += data.toString();
          },
        },
        {
          write: (data) => {
            output += data.toString();
          },
        }
      );

      stream.on("end", () => {
        console.info("Container command completed");
        resolve(output);
      });
      stream.on("error", (err) => {
        console.info("Container command error:", err);
        reject(err);
      });
    });
  });
}
