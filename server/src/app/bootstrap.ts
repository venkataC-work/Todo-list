import type { Config } from '../config/env.js';
import {
  filePersistence,
  memoryPersistence,
  type Persistence,
} from '../infrastructure/store/persistence.js';
import { createStore } from '../infrastructure/store/store.js';
import type { Logger } from '../shared/logger.js';
import { createApp } from './create-app.js';
import { createServices } from './create-services.js';

interface BootstrapOptions {
  persistence?: Persistence;
  logger?: Logger;
}

/** Wires dependencies without opening a port, so startup is also testable. */
export const bootstrap = async (config: Config, { persistence, logger }: BootstrapOptions = {}) => {
  const store = await createStore(
    persistence ?? (config.dataFile ? filePersistence(config.dataFile) : memoryPersistence()),
  );
  const services = createServices(store, config);
  return { app: createApp({ services, config, logger }), store, services };
};
