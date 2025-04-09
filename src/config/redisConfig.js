export const redisConfig = {
  redisQueue: {
    url: "redis://localhost:6379", // For queuing code from WebSocket
  },
  redisDB: {
    url: "redis://localhost:6380", // For persistent data storage
  },
  redisPubSub: {
    url: "redis://localhost:6381", // For pub/sub to receive executed code
  },
};
