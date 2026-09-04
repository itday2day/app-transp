// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web implementation (wa-sqlite) ships a .wasm binary that
// Metro needs to treat as an asset rather than trying to parse as source.
config.resolver.assetExts.push("wasm");

module.exports = config;
