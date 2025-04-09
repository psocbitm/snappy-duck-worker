import { createClient } from "redis";
import { getLogger } from "../utils/logger.js";
import { redisConfig } from "../config/redisConfig.js";
const logger = getLogger(import.meta.url);
/**
 * Configuration for the three Redis instances.
 * These can be adjusted via environment variables or a config file in a production environment.
 */


/**
 * Global instances for the Redis clients.
 * These will be initialized after successful connection and can be accessed via getter functions.
 */
let redisQueue, redisPubSub;

/**
 * A Map to track pending requests, mapping request IDs to WebSocket connections.
 * This allows the pub/sub handler to send executed code back to the correct WebSocket client.
 */
// const pendingRequests = new Map();

/**
 * Sets up connections to all three Redis instances and configures the pub/sub subscription.
 * @throws {Error} If any Redis connection fails or subscription setup encounters an error.
 */
async function setupRedis() {
  try {
    // Create Redis clients with their respective configurations
    redisQueue = createClient(redisConfig.redisQueue);
    redisPubSub = createClient(redisConfig.redisPubSub);

    redisQueue.on("error", (err) => {
      console.error("Redis Queue error:", err);
      // Optionally, implement reconnection logic or graceful shutdown here
    });
    redisPubSub.on("error", (err) => {
      console.error("Redis PubSub error:", err);
      // Optionally, implement reconnection logic or graceful shutdown here
    });

    // Connect to all three Redis instances concurrently
    await Promise.all([
      redisQueue.connect(),
      redisPubSub.connect(),
    ]);

    logger.info({
      log: "All Redis clients connected",
      redisQueue: redisQueue.isReady,
      redisPubSub: redisPubSub.isReady,
    });
  } catch (err) {
    logger.error({
      log: "Failed to initialize Redis clients",
      error: err.message,
    });
    throw err; // Rethrow to allow the application to handle startup failure
  }
}

/**
 * Getter functions to access the Redis instances from other parts of the application.
 * These ensure that the instances are only accessed after setupRedis() has completed.
 */
export { setupRedis };
export { redisQueue, redisPubSub };
