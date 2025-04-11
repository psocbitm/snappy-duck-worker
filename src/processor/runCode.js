const Docker = require("dockerode");
const { PassThrough } = require("stream");

// Initialize Docker client
const docker = new Docker();

// Configuration for supported languages
const languageConfigs = {
  cpp: {
    image: "cpp-latest",
    extension: "cpp",
    compileCmd: "g++ main.cpp -o main",
    runCmd: "./main",
  },
  python: {
    image: "python:slim",
    extension: "py",
    compileCmd: null,
    runCmd: "python main.py",
  },
  javascript: {
    image: "node:slim",
    extension: "js",
    compileCmd: null,
    runCmd: "node main.js",
  },
  java: {
    image: "amazoncorretto:24-alpine",
    extension: "java",
    compileCmd: "javac Main.java",
    runCmd: "java Main",
  },
};

/**
 * Executes code in a Docker container for the specified language.
 * @param {string} code - The source code to execute.
 * @param {string} language - The programming language ('cpp', 'python', 'javascript', 'java').
 * @param {string} input - The input data for the code (via stdin).
 * @returns {Promise<{ output: string, error: string }>} - The execution result with stdout and stderr.
 * @throws {Error} - If the language is unsupported or an unexpected error occurs.
 */
export async function runCode({ code, language, input }) {
  // Validate language
  const config = languageConfigs[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const { image, extension, compileCmd, runCmd } = config;
  const filename = `main.${extension}`;

  // Create Docker container
  const container = await docker.createContainer({
    Image: image,
    Tty: false,
    // Keep container alive until execution completes
    Cmd: ["/bin/sh", "-c", "while true; do sleep 1; done"],
    HostConfig: {
      // Limit resources for security and stability
      Memory: 512 * 1024 * 1024, // 512MB memory limit
      CpuPeriod: 100000,
      CpuQuota: 50000, // Limit CPU usage
    },
  });

  try {
    // Start the container
    await container.start();

    // Write code to file using base64 to handle special characters
    const base64Code = Buffer.from(code).toString("base64");
    const writeCmd = `echo '${base64Code}' | base64 -d > ${filename}`;
    const writeExec = await container.exec({
      Cmd: ["sh", "-c", writeCmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    const writeStream = await writeExec.start({ hijack: true });
    const writeStderrStream = new PassThrough();
    let writeStderr = "";
    writeStderrStream.on("data", (data) => (writeStderr += data.toString()));
    docker.modem.demuxStream(writeStream, new PassThrough(), writeStderrStream);

    await new Promise((resolve) => writeStream.on("end", resolve));
    const writeInspect = await writeExec.inspect();
    if (writeInspect.ExitCode !== 0) {
      throw new Error(`Failed to write code to file: ${writeStderr}`);
    }

    // Compile code if required (C++ and Java)
    let compileError = "";
    if (compileCmd) {
      const compileExec = await container.exec({
        Cmd: ["sh", "-c", compileCmd],
        AttachStdout: true,
        AttachStderr: true,
      });

      const compileStream = await compileExec.start({ hijack: true });
      const compileStderrStream = new PassThrough();
      compileStderrStream.on(
        "data",
        (data) => (compileError += data.toString())
      );
      docker.modem.demuxStream(
        compileStream,
        new PassThrough(),
        compileStderrStream
      );

      await new Promise((resolve) => compileStream.on("end", resolve));
      const compileInspect = await compileExec.inspect();
      if (compileInspect.ExitCode !== 0) {
        return { output: "", error: compileError };
      }
    }

    // Execute the code with input
    const runExec = await container.exec({
      Cmd: ["sh", "-c", runCmd],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    const runStream = await runExec.start({ hijack: true, stdin: true });
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    let output = "";
    let error = "";
    stdoutStream.on("data", (data) => (output += data.toString()));
    stderrStream.on("data", (data) => (error += data.toString()));
    docker.modem.demuxStream(runStream, stdoutStream, stderrStream);

    // Provide input via stdin
    runStream.write(input);
    runStream.end();

    await new Promise((resolve) => runStream.on("end", resolve));
    const runInspect = await runExec.inspect();
    if (runInspect.ExitCode !== 0) {
      return { output: "", error: output + error };
    }

    return { output, error };
  } finally {
    // Ensure container cleanup
    try {
      await container.stop();
      await container.remove();
    } catch (cleanupError) {
      console.error("Container cleanup failed:", cleanupError);
    }
  }
}

// Example usage (for testing purposes)
/*
(async () => {
  try {
    const cppCode = `
      #include <iostream>
      using namespace std;
      int main() {
        string input;
        getline(cin, input);
        cout << "Hello, " << input << "!" << endl;
        return 0;
      }
    `;
    const result = await runCode(cppCode, 'cpp', 'World');
    console.log('Output:', result.output);
    console.log('Error:', result.error);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
*/
