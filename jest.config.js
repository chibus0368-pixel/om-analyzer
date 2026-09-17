/**
 * Unit tests for the pure analysis modules (scoring math, value-add lens,
 * quick screen). Deliberately scoped to src/lib — component and page tests
 * belong in Playwright (npm run test:e2e), not here.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/lib"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx", esModuleInterop: true } }],
  },
};
