import { runCode } from "./processor/runCode.js";
import { publish } from "./redis/producer/publish.js";
import { pickFromQueue } from "./redis/queue/pickFromQueue.js";
import { setupRedis } from "./redis/redisSetup.js";
import { getLogger } from "./utils/logger.js";
const logger = getLogger(import.meta.url);
export const startServer = async () => {
  try {
    logger.info({
      log: "Starting server",
    });
    await setupRedis();
    while (true) {
      const job = await pickFromQueue();
      let parsedData;
      try {
        parsedData = JSON.parse(job.element);
      } catch (error) {
        logger.error({
          log: "Error parsing job",
          error: error,
        });
        continue;
      }
      logger.info({
        log: "Processing job",
        job: parsedData,
      });
      try {
        const result = await runCode({
          code: parsedData.code,
          language: parsedData.language,
          input: parsedData.input,
        });
        try {
          await publish({
            id: parsedData.id,
            result: result,
          });
          logger.info({
            log: "Result published",
            result: result,
          });
        } catch (error) {
          logger.error({
            log: "Error publishing result",
            error: error,
          });
          throw error;
        }
      } catch (error) {
        logger.error({
          log: "Error processing job",
          error: error,
        });
      }
    }
  } catch (error) {
    logger.error({
      log: "Error starting server",
      error: error,
    });
    process.exit(1);
  }
};
