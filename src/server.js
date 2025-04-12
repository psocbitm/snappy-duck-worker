import { runCode } from "./processor/runCode.js";
import { publish } from "./redis/producer/publish.js";
import { pickFromQueue } from "./redis/queue/pickFromQueue.js";
import { setupRedis } from "./redis/redisSetup.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger(import.meta.url);

// Limit the number of parallel jobs
const CONCURRENCY_LIMIT = 5;

export const startServer = async () => {
  try {
    logger.info({ log: "Starting server" });
    await setupRedis();

    // Start workers
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
      runWorker(i);
    }
  } catch (error) {
    logger.error({
      log: "Error starting server",
      error: error,
    });
    process.exit(1);
  }
};

async function runWorker(workerId) {
  while (true) {
    try {
      const job = await pickFromQueue();
      if (!job) continue;

      let parsedData;
      try {
        parsedData = JSON.parse(job.element);
      } catch (error) {
        logger.error({
          log: `Worker ${workerId} - Error parsing job`,
          error,
        });
        continue;
      }

      logger.info({
        log: `Worker ${workerId} - Processing job`,
        job: parsedData,
      });

      let result;
      try {
        result = await runCode({
          code: parsedData.code,
          language: parsedData.language,
          input: parsedData.input,
        });
      } catch (error) {
        logger.error({
          log: `Worker ${workerId} - Error running code`,
          error,
        });
        result = {
          success: false,
          output: "",
          error: "Internal server error",
        };
      }

      try {
        await publish({
          id: parsedData.id,
          result,
        });
        logger.info({
          log: `Worker ${workerId} - Result published`,
          result,
        });
      } catch (error) {
        logger.error({
          log: `Worker ${workerId} - Error publishing result`,
          error,
        });
      }
    } catch (err) {
      logger.error({
        log: `Worker ${workerId} - Unexpected error`,
        error: err,
      });
    }
  }
}
