import express from "express";
import http from "http";
import { initSocket } from "../sockets/initSocket.js";
import cors from "cors";
import { getLogger } from "../utils/logger.js";
import { setupRedis } from "../redis/redisSetup.js";
const logger = getLogger(import.meta.url);
export const setupApp = async () => {
  try {
    const app = express();
    // Middlewares
    app.use(express.json());
    app.use(cors());

    // Redis
    logger.info({
      log: "Setting up Redis",
    });
    await setupRedis();

    // Socket
    const server = http.createServer(app);
    logger.info({
      log: "Setting up Socket",
    });
    initSocket(server);

    // Return
    return server;
  } catch (error) {
    logger.error({
      log: "Error setting up app",
      error: error.message,
    });
    throw error;
  }
};
