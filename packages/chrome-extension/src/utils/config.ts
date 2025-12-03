import { LogLevel } from '@mcp-pointer/shared/logger';

export interface ExtensionConfig {
  enabled: boolean;
  websocket: {
    host: string; // Remote host (IP or hostname) - 'localhost' for local, VPS IP for remote
    port: number;
  };
  logger: {
    enabled: boolean;
    level: LogLevel;
  };
}

const config: ExtensionConfig = {
  enabled: true,
  websocket: {
    host: 'localhost', // Default to localhost, user can change to VPS IP
    port: 7007,
  },
  logger: {
    enabled: IS_DEV,
    level: LogLevel.DEBUG,
  },
};

export default config;
