/** @type {import('jest').Config} */
module.exports = {
  rootDir: "test",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  testRegex: ".*\\.e2e-spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  testTimeout: 30_000,
};
