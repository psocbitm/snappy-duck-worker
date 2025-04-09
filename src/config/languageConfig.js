export const languageConfigs = {
  cpp: {
    image: "cpp-alpine",
    fileName: "main.cpp",
    cmdArgs: ["sh", "-c", "g++ /app/main.cpp -o /app/main && /app/main"],
  },
  python: {
    image: "python:slim",
    fileName: "main.py",
    cmdArgs: ["python", "/app/main.py"],
  },
  java: {
    image: "amazoncorretto:24-alpine",
    fileName: "Main.java",
    cmdArgs: ["sh", "-c", "javac -cp /app /app/Main.java && java -cp /app Main"],
  },
  javascript: {
    image: "node:slim",
    fileName: "main.js",
    cmdArgs: ["node", "/app/main.js"],
  },
};
