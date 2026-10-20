import { bootstrap } from './app/bootstrap.js';
import { loadConfig } from './config/env.js';

try {
  const config = loadConfig();
  const { app } = await bootstrap(config, { logger: console });
  const server = app.listen(config.port, () => {
    console.info(`API listening on http://localhost:${config.port}`);
  });
  server.on('error', (error) => {
    console.error('Unable to start the API.', error);
    process.exitCode = 1;
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exitCode = 1;
    }, 10_000);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      if (error) {
        console.error('Unable to close the API cleanly.', error);
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error('Unable to initialize the API.', error);
  process.exitCode = 1;
}
