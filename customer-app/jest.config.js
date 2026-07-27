/**
 * Isolated unit-test setup for pure logic modules (no React Native / native imports), using ts-jest
 * on a plain Node environment. This deliberately does NOT use jest-expo or babel-preset-expo so it
 * stays fully decoupled from the Metro/EAS build. If component or hook tests are added later, switch
 * to the jest-expo preset (and add a babel.config.js) instead.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      // isolatedModules lives inside this scoped tsconfig (not the project's) so it only affects
      // ts-jest's transpile and avoids the deprecated top-level ts-jest option.
      { tsconfig: { module: "commonjs", isolatedModules: true } },
    ],
  },
  testMatch: ["**/*.test.ts"],
};
