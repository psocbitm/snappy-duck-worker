import { languageConfigs } from "../config/languageConfig.js";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { getLogger } from "../utils/logger.js";

// Constants
const EXECUTION_TIMEOUT = "10s";
const MEMORY_LIMIT = "256m";
const CPU_LIMIT = "0.5";

/**
 * Executes code in a secure Docker sandbox environment.
 * @param {Object} params - Execution parameters
 * @param {string} params.code - Source code to execute
 * @param {string} params.language - Programming language
 * @param {string} [params.input] - Input for stdin
 * @returns {Promise<string>} - Execution output or error message
 * @throws {Error} - On critical execution failures
 */
export const runCode = async ({ code, language, input = "" }) => {
  const logger = getLogger(import.meta.url);

  logger.info({
    message: "Executing code",
    language,
    hasInput: !!input,
  });

  const config = validateLanguage(language);
  const tempFile = createTempFilePath(config.fileName);

  try {
    await fs.writeFile(tempFile, code, { encoding: "utf8" });
    const result = await executeInDocker({ config, tempFile, input });
    return result;
  } catch (error) {
    throw new Error(`Execution failed for ${language}: ${error.message}`);
  } finally {
    await cleanupTempFile(tempFile);
  }
};

/**
 * Validates language and returns its configuration.
 * @param {string} language - Programming language
 * @returns {Object} - Language configuration
 */
function validateLanguage(language) {
  const config = languageConfigs[language];
  if (!config) {
    throw new Error(
      `Unsupported language: ${language}. Supported: ${Object.keys(
        languageConfigs
      ).join(", ")}`
    );
  }
  return config;
}

/**
 * Creates a unique temporary file path.
 * @param {string} fileName - Base filename
 * @returns {string} - Full temporary path
 */
function createTempFilePath(fileName) {
  return join(tmpdir(), `code-${randomUUID()}-${fileName}`);
}

/**
 * Executes code in Docker container.
 * @param {Object} params - Execution parameters
 * @param {Object} params.config - Language configuration
 * @param {string} params.tempFile - Temporary file path
 * @param {string} params.input - Input string
 * @returns {Promise<string>} - Execution result
 */
async function executeInDocker({ config, tempFile, input }) {
  const dockerArgs = [
    "run",
    "-i",
    "--rm",
    `--memory=${MEMORY_LIMIT}`,
    `--cpus=${CPU_LIMIT}`,
    "--network=none",
    "-v",
    `${tempFile}:/app/${config.fileName}`,
    config.image,
    "timeout",
    EXECUTION_TIMEOUT,
    ...config.cmdArgs,
  ];

  return new Promise((resolve, reject) => {
    const process = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    process.stdout.on("data", (data) => (output += data.toString("utf8")));
    process.stderr.on("data", (data) => (errorOutput += data.toString("utf8")));
    process.on("error", (err) =>
      reject(new Error(`Docker spawn failed: ${err.message}`))
    );

    process.stdin.write(input);
    process.stdin.end();

    process.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else if (code === 124) resolve("Timeout: Execution exceeded 10 seconds");
      else resolve(errorOutput.trim() || `Execution failed with code ${code}`);
    });
  });
}

/**
 * Safely removes temporary file.
 * @param {string} filePath - Path to file
 */
async function cleanupTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Cleanup failed for ${filePath}: ${error.message}`);
  }
}
