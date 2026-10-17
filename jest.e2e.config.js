// Cross-stack test: the app's own API layer talking to a REAL running backend.
// Not part of `npm test` (that never needs a server). Run it with `npm run test:e2e`.
module.exports = {
  ...require("./package.json").jest,
  testEnvironment: "node",
  testMatch: ["<rootDir>/e2e/**/*.e2e.test.js"],
  testTimeout: 30000,
  testPathIgnorePatterns: ["/node_modules/", "/backend/"],
};
