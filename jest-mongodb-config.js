module.exports = {
  mongodbMemoryServerOptions: {
    binary: {
      version: '7.0.1',
      skipMD5: false,
    },
    instance: {},
    autoStart: false,
  },
  useSharedDBForAllJestWorkers: false,
};
