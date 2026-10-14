// Cross-stack test: the app's own API layer talking to a REAL running backend.
// Not part of `npm test` (that never needs a server). Run it with `npm run test:e2e`.
module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  testMatch: ["<rootDir>/e2e/**/*.e2e.test.js"],
  testTimeout: 30000,
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)",
  ],
};