import { redisQueue } from "../redisSetup.js";
import { getLogger } from "../../utils/logger.js";
const logger = getLogger(import.meta.url);
export const pickFromQueue = async () => {
  try {
    return await redisQueue.brPop("queue", 0);
  } catch (error) {
    logger.error({
      log: "Error picking from queue",
      error: error,
    });
    throw error;
  }
};
