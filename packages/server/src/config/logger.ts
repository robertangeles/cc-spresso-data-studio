import pino from 'pino';
import { config } from './index.js';

export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport: config.isDev
    ? {
        target: 'pino/file',
        options: { destination: 1 }, // stdout
      }
    : undefined,
});
