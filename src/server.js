'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

const server = app.listen(config.port, config.host, () => {
  logger.info('C Visualizer listening', {
    url: `http://${config.host}:${config.port}`,
    compiler: config.compiler,
    debugger: config.gdb,
    namespaces: config.useNamespaces,
    maxSteps: config.maxSteps,
  });
});

function shutdown(signal) {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
