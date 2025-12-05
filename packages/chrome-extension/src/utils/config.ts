import { LogLevel } from '@mcp-pointer/shared/logger';

/**
 * Route configuration for URL-based routing
 * Maps URL patterns to specific WebSocket endpoints
 */
export interface RouteConfig {
  /** Unique identifier for this route */
  id: string;
  /** Display name for UI */
  name: string;
  /** URL pattern to match (can be port number, hostname, or regex) */
  pattern: string;
  /** Pattern type: 'port' matches :PORT in URL, 'contains' matches substring, 'regex' for advanced */
  patternType: 'port' | 'contains' | 'regex';
  /** WebSocket host to send to */
  host: string;
  /** WebSocket port to send to */
  port: number;
  /** Whether this route is enabled */
  enabled: boolean;
}

export interface ExtensionConfig {
  enabled: boolean;
  /** Enable automatic URL-based routing */
  autoRouting: boolean;
  /** Default WebSocket config (used when no route matches) */
  websocket: {
    host: string;
    port: number;
  };
  /** Routing rules for multi-instance support */
  routes: RouteConfig[];
  logger: {
    enabled: boolean;
    level: LogLevel;
  };
}

/**
 * Default routes for common development ports
 * Maps dev server ports to MCP server ports
 */
const defaultRoutes: RouteConfig[] = [
  {
    id: 'dentistry',
    name: 'DentistryGPT',
    pattern: '22002',
    patternType: 'port',
    host: '72.61.197.216',
    port: 7022,
    enabled: true,
  },
  {
    id: 'kommu',
    name: 'Kommu',
    pattern: '33001',
    patternType: 'port',
    host: '72.61.197.216',
    port: 7033,
    enabled: true,
  },
  {
    id: 'gluten-libre',
    name: 'Gluten-Libre',
    pattern: '22001',
    patternType: 'port',
    host: '72.61.197.216',
    port: 7021,
    enabled: true,
  },
];

const config: ExtensionConfig = {
  enabled: true,
  autoRouting: true,
  websocket: {
    host: '72.61.197.216',
    port: 7007,
  },
  routes: defaultRoutes,
  logger: {
    enabled: IS_DEV,
    level: LogLevel.DEBUG,
  },
};

export default config;

/**
 * Find matching route for a given URL
 * @param url The current tab URL
 * @param routes Available routing rules
 * @returns Matching route or null
 */
export function findMatchingRoute(url: string, routes: RouteConfig[]): RouteConfig | null {
  for (const route of routes) {
    if (!route.enabled) continue;

    let matches = false;

    switch (route.patternType) {
      case 'port':
        // Match :PORT in URL (e.g., :22002)
        matches = url.includes(`:${route.pattern}`);
        break;
      case 'contains':
        // Simple substring match
        matches = url.includes(route.pattern);
        break;
      case 'regex':
        // Regex match
        try {
          const regex = new RegExp(route.pattern);
          matches = regex.test(url);
        } catch {
          // Invalid regex, skip
          matches = false;
        }
        break;
    }

    if (matches) {
      return route;
    }
  }

  return null;
}

/**
 * Generate a unique route ID
 */
export function generateRouteId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
