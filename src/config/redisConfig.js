export const redisConfig = {
  redisQueue: {
    url: "rediss://red-cvrb2ba4d50c73all4j0:EARIt7ArKxXZvU7R8cBoiFpnI9ZQZUwQ@oregon-keyvalue.render.com:6379", // For queuing code from WebSocket
  },
  redisPubSub: {
    url: "rediss://red-cvrb2ba4d50c73all4i0:Ez61K69KSZCb2MUQ42TcwIlwAbee7pXf@oregon-keyvalue.render.com:6379", // For pub/sub to receive executed code
  },
};
