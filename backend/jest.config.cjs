/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ["<rootDir>/tests"],
  setupFiles: ["<rootDir>/tests/jest.setup.ts"],
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
};
