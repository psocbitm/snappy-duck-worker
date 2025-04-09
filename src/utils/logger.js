// src/utils/logger.js
import { createLogger, format, transports } from "winston";
import path from "path";
import { fileURLToPath } from "url";
import util from "util";

const { combine, timestamp, label, printf, errors, colorize, splat, json } = format;

function getFilename(importMetaUrl) {
  return path.basename(fileURLToPath(importMetaUrl));
}

// 👇 Safely formats objects & errors for console
function formatMessage(msg) {
  if (typeof msg === "string") return msg;
  return util.inspect(msg, { depth: null, colors: true });
}

// 👇 Console log format
function buildConsoleFormat(filename) {
  return combine(
    colorize(),
    label({ label: "app" }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    splat(),
    printf(({ timestamp, level, label, message }) => {
      return `${timestamp} [${label}] ${level} ${filename}: ${formatMessage(
        message
      )}`;
    })
  );
}

function buildFileFormat(filename) {
  return combine(
    label({ label: filename }),
    timestamp(),
    errors({ stack: true }),
    splat(),
    json(),
  );
}

export function getLogger(importMetaUrl) {
  const filename = getFilename(importMetaUrl);

  const logger = createLogger({
    level: "info",
    format: buildFileFormat(filename), // default format for files
    transports: [
      new transports.File({ filename: "logs/error.log", level: "error" }),
      new transports.File({ filename: "logs/combined.log" }),
    ],
  });

  // Add console in dev only
  if (process.env.NODE_ENV !== "production") {
    logger.add(
      new transports.Console({ format: buildConsoleFormat(filename) })
    );
  }

  return logger;
}
