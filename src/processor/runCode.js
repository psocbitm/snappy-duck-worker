import Docker from "dockerode";
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Define supported languages and their configurations
const languageConfigs = {
  cpp: {
    image: "cpp-alpine",
    ext: "cpp",
    compileCmd: "g++ code.cpp -o code",
    runCmd: "./code",
  },
  java: {
    image: "amazoncorretto:24-alpine",
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
    image: "node:slim", // Note: Comment mentions 'latest', but code uses 'slim'
    ext: "js",
    compileCmd: null,
    runCmd: "node code.js",
  },
};

// Container pool management
const containerPool = new Map();
const languages = ["cpp", "java", "python", "javascript"];
const poolSize = 5; // Number of containers per language

// Initialize pool at application startup
async function initializePool() {
  console.info("Initializing container pool...");
  for (const lang of languages) {
    containerPool.set(lang, []);
    const pool = containerPool.get(lang);
    for (let i = 0; i < poolSize; i++) {
      const container = await createContainer(lang);
      pool.push({ container, status: "idle" });
    }
  }
  console.info("Container pool initialized.");
}

// Create and start a container for a given language
async function createContainer(lang) {
  const config = languageConfigs[lang];
  const container = await docker.createContainer({
    Image: config.image,
    Tty: false,
    OpenStdin: true,
    StdinOnce: false, // Keep stdin open for reuse
    WorkingDir: "/app",
    HostConfig: {
      Memory: 512 * 1024 * 1024, // 512MB memory limit
      AutoRemove: false, // Keep container running
    },
  });
  await container.start();
  return container;
}

// Modified execContainerCommand to support stdin input
async function execContainerCommand(container, cmd, input = null) {
  console.info("Executing container command:", cmd);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: !!input, // Enable stdin only if input is provided
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  return new Promise((resolve, reject) => {
    exec.start({ hijack: true, stdin: !!input }, (err, stream) => {
      if (err) return reject(err);

      if (input) {
        stream.write(input);
        stream.end();
      }

      let output = "";
      docker.modem.demuxStream(
        stream,
        { write: (data) => (output += data.toString()) },
        { write: (data) => (output += data.toString()) }
      );

      stream.on("end", () => {
        console.info("Container command completed");
        resolve(output);
      });
      stream.on("error", (err) => {
        console.error("Container command error:", err);
        reject(err);
      });
    });
  });
}

// Main function to run code
export async function runCode({ code, language, input }) {
  console.info("Starting code execution with language:", language);

  // Validate language
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

  // Get or create a container from the pool
  let pool = containerPool.get(language);
  if (!pool) {
    throw new Error(`No pool for language: ${language}`);
  }
  let containerObj = pool.find((c) => c.status === "idle");
  if (!containerObj) {
    console.info("No idle containers, creating a new one for:", language);
    const container = await createContainer(language);
    containerObj = { container, status: "busy" };
    pool.push(containerObj);
  } else {
    containerObj.status = "busy";
    console.info("Using idle container for:", language);
  }
  const container = containerObj.container;

  try {
    // Clean up working directory
    console.info("Cleaning up working directory");
    await execContainerCommand(container, ["bash", "-c", "rm -rf /app/*"]);

    // Copy code directly to container
    console.info("Copying code to container");
    await execContainerCommand(
      container,
      ["bash", "-c", `cat > /app/${containerFileName}`],
      code
    );

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

        docker.modem.demuxStream(
          stream,
          { write: (data) => (stdout += data.toString()) },
          { write: (data) => (stderr += data.toString()) }
        );

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
          console.error("Stream error occurred:", error.message);
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
    // Mark container as idle (no stop/remove since we reuse it)
    containerObj.status = "idle";
    console.info("Container marked as idle");
  }
}

// Initialize the pool when the application starts
initializePool().catch((err) =>
  console.error("Failed to initialize pool:", err)
);
