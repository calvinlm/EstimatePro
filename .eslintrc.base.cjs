module.exports = {
  root: true,
  env: {
    es2022: true,
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**"],
  rules: {
    eqeqeq: ["error", "always"],
    curly: ["error", "all"],
    "no-var": "error",
  },
};
