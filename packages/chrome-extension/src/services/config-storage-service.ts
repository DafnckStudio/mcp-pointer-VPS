import defaultConfig, { ExtensionConfig, RouteConfig } from '../utils/config';
import logger from '../utils/logger';

const STORAGE_KEY = 'mcp_pointer_config';
const CONFIG_VERSION = 3; // Increment when config structure changes

interface StoredConfig extends ExtensionConfig {
  _version?: number;
}

/**
 * Migrate old route format (host + port) to new format (mcpPort only)
 * Host is now auto-detected from URL
 */
function migrateRoute(route: any): RouteConfig {
  // Already has mcpPort - new format
  if ('mcpPort' in route) {
    return route;
  }

  // Old format with host and port - migrate to mcpPort
  logger.info(`🔄 Migrating route "${route.name}" to auto-host format`);
  return {
    id: route.id,
    name: route.name,
    pattern: route.pattern,
    patternType: route.patternType,
    mcpPort: route.port, // Use old port as mcpPort
    enabled: route.enabled,
  };
}

/**
 * Migrate old config format to new format with routes
 */
function migrateConfig(stored: any): ExtensionConfig {
  // Already has routes - migrate routes if needed
  if (stored.routes && Array.isArray(stored.routes)) {
    return {
      enabled: stored.enabled ?? defaultConfig.enabled,
      autoRouting: stored.autoRouting ?? defaultConfig.autoRouting,
      websocket: stored.websocket ?? defaultConfig.websocket,
      routes: stored.routes.map(migrateRoute),
      logger: stored.logger ?? defaultConfig.logger,
    };
  }

  // Old config without routes - migrate
  logger.info('🔄 Migrating config to new format with routes');

  return {
    enabled: stored.enabled ?? defaultConfig.enabled,
    autoRouting: true, // Enable auto-routing by default
    websocket: stored.websocket ?? defaultConfig.websocket,
    routes: defaultConfig.routes, // Use default routes
    logger: stored.logger ?? defaultConfig.logger,
  };
}

export default class ConfigStorageService {
  static async load(): Promise<ExtensionConfig> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] as StoredConfig | undefined;

      if (stored) {
        const config = migrateConfig(stored);
        logger.debug('📁 Config loaded from storage:', config);
        return config;
      }

      logger.debug('📁 No config found, using defaults');
      return defaultConfig;
    } catch (error) {
      logger.error('❌ Failed to load config from storage:', error);
      return defaultConfig;
    }
  }

  static async save(config: ExtensionConfig): Promise<void> {
    try {
      const configWithVersion: StoredConfig = {
        ...config,
        _version: CONFIG_VERSION,
      };
      await chrome.storage.sync.set({ [STORAGE_KEY]: configWithVersion });
      logger.debug('💾 Config saved to storage:', config);
    } catch (error) {
      logger.error('❌ Failed to save config to storage:', error);
      throw error;
    }
  }

  static async update(updates: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    const currentConfig = await this.load();
    const newConfig = { ...currentConfig, ...updates };
    await this.save(newConfig);
    return newConfig;
  }

  /**
   * Add a new route to the config
   */
  static async addRoute(route: RouteConfig): Promise<ExtensionConfig> {
    const currentConfig = await this.load();
    const newRoutes = [...currentConfig.routes, route];
    return this.update({ routes: newRoutes });
  }

  /**
   * Update an existing route
   */
  static async updateRoute(routeId: string, updates: Partial<RouteConfig>): Promise<ExtensionConfig> {
    const currentConfig = await this.load();
    const newRoutes = currentConfig.routes.map((route) =>
      route.id === routeId ? { ...route, ...updates } : route
    );
    return this.update({ routes: newRoutes });
  }

  /**
   * Remove a route by ID
   */
  static async removeRoute(routeId: string): Promise<ExtensionConfig> {
    const currentConfig = await this.load();
    const newRoutes = currentConfig.routes.filter((route) => route.id !== routeId);
    return this.update({ routes: newRoutes });
  }

  /**
   * Toggle a route's enabled state
   */
  static async toggleRoute(routeId: string): Promise<ExtensionConfig> {
    const currentConfig = await this.load();
    const newRoutes = currentConfig.routes.map((route) =>
      route.id === routeId ? { ...route, enabled: !route.enabled } : route
    );
    return this.update({ routes: newRoutes });
  }

  static onChange(callback: (config: ExtensionConfig) => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes[STORAGE_KEY]) {
        const newConfig = changes[STORAGE_KEY].newValue;
        if (newConfig) {
          const migratedConfig = migrateConfig(newConfig);
          logger.debug('📁 Config changed:', migratedConfig);
          callback(migratedConfig);
        }
      }
    });
  }
}
