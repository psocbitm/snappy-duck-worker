import { redisPubSub } from "../redisSetup.js";
import { getLogger } from "../../utils/logger.js";
const logger = getLogger(import.meta.url);
export const publish = async (job) => {
  try {
    logger.info({
      log: "Publishing job to pubsub",
      job: job,
    });
    await redisPubSub.publish("pubsub", JSON.stringify(job));
  } catch (error) {
    logger.error({
      log: "Error publishing job to pubsub",
      error: error,
    });
    throw error;
  }
};
