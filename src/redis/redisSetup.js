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
let redisDB, redisQueue, redisPubSub;

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
    redisDB = createClient(redisConfig.redisDB);
    redisQueue = createClient(redisConfig.redisQueue);
    redisPubSub = createClient(redisConfig.redisPubSub);

    // Set up error handlers for ongoing errors after connection
    redisDB.on("error", (err) => {
      console.error("Redis DB error:", err);
      // Optionally, implement reconnection logic or graceful shutdown here
    });
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
      redisDB.connect(),
      redisQueue.connect(),
      redisPubSub.connect(),
    ]);

    // // Configure the pub/sub subscription to receive executed code
    // await redisPubSub.subscribe("executed_code", (message) => {
    //   try {
    //     // Parse the incoming message, expecting { id, result }
    //     const { id, result } = JSON.parse(message);
    //     const ws = pendingRequests.get(id);
    //     if (ws) {
    //       // Send the result back to the corresponding WebSocket client
    //       ws.send(JSON.stringify({ id, result }));
    //       pendingRequests.delete(id); // Clean up after sending
    //     } else {
    //       console.warn(`No pending request found for id: ${id}`);
    //     }
    //   } catch (err) {
    //     console.error("Error processing pub/sub message:", err);
    //   }
    // });

    logger.info({
      log: "All Redis clients connected",
      redisDB: redisDB.isReady,
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
export { redisDB, redisQueue, redisPubSub };
