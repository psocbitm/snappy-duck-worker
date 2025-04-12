export const languageConfigs = {
  cpp: {
    image: "gcc:latest",
    sourceFileName: "main.cpp",
    compile: (sourceFile, programFile) => [
      "g++",
      sourceFile,
      "-o",
      programFile,
      "-std=c++17", // Add C++17 support
    ],
    run: (sourceFile, programFile) => programFile,
  },
  java: {
    image: "amazoncorretto:24-alpine",
    sourceFileName: "Main.java",
    compile: (sourceFile) => ["javac", sourceFile],
    run: () => "java Main",
  },
  javascript: {
    image: "node:alpine",
    sourceFileName: "main.js",
    compile: null,
    run: (sourceFile) => `node ${sourceFile}`,
  },
  python: {
    image: "python:alpine",
    sourceFileName: "main.py",
    compile: null,
    run: (sourceFile) => `python ${sourceFile}`,
  },
};
