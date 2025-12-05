import { ConnectionStatus } from '@mcp-pointer/shared/types';
import logger from './utils/logger';
import { ElementSenderService } from './services/element-sender-service';
import { ExtensionConfig, findMatchingRoute, RouteConfig, extractHostFromUrl } from './utils/config';
import ConfigStorageService from './services/config-storage-service';

let elementSender: ElementSenderService;
let currentConfig: ExtensionConfig;

// Track active route per tab for debugging
const activeRoutes: Map<number, RouteConfig | null> = new Map();

// Initialize when service worker starts
async function initialize() {
  currentConfig = await ConfigStorageService.load();

  // Create the service (no connection on startup)
  elementSender = new ElementSenderService();

  logger.info('🚀 MCP Pointer Multi-Instance loaded', {
    enabled: currentConfig.enabled,
    autoRouting: currentConfig.autoRouting,
    routeCount: currentConfig.routes.length,
    defaultHost: currentConfig.websocket.host,
    defaultPort: currentConfig.websocket.port,
  });

  // Log available routes
  if (currentConfig.autoRouting && currentConfig.routes.length > 0) {
    logger.info('📍 Available routes (host auto-detected from URL):');
    currentConfig.routes.forEach((route) => {
      logger.info(`   ${route.enabled ? '✓' : '✗'} ${route.name}: :${route.pattern} → MCP port ${route.mcpPort}`);
    });
  }
}

// Listen for config changes
ConfigStorageService.onChange((newConfig: ExtensionConfig) => {
  logger.info('⚙️ Config changed:', {
    enabled: newConfig.enabled,
    autoRouting: newConfig.autoRouting,
    routeCount: newConfig.routes.length,
  });

  currentConfig = newConfig;

  if (newConfig.enabled) {
    logger.info('✅ Extension enabled');
  } else {
    logger.info('❌ Extension disabled');
  }
});

/**
 * Determine the WebSocket endpoint based on URL and routing config
 * Host is automatically extracted from the URL
 */
function getEndpointForUrl(url: string): { host: string; port: number; route: RouteConfig | null } {
  // Extract host from URL automatically
  const extractedHost = extractHostFromUrl(url);
  const host = extractedHost || currentConfig.websocket.host;

  if (!currentConfig.autoRouting) {
    // Auto-routing disabled - use default port with extracted host
    return {
      host,
      port: currentConfig.websocket.port,
      route: null,
    };
  }

  const matchedRoute = findMatchingRoute(url, currentConfig.routes);

  if (matchedRoute) {
    // Use extracted host + route's MCP port
    return {
      host,
      port: matchedRoute.mcpPort,
      route: matchedRoute,
    };
  }

  // No route matched - use extracted host + default port
  return {
    host,
    port: currentConfig.websocket.port,
    route: null,
  };
}

// Listen for messages from content script
chrome.runtime.onMessage
  .addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    if (request.type === 'DOM_ELEMENT_POINTED' && request.data) {
      // Get the URL from the sender tab or from the request data
      const url = request.data.url || sender.tab?.url || '';
      const tabId = sender.tab?.id;

      // Determine which endpoint to use based on URL
      const { host, port, route } = getEndpointForUrl(url);

      // Track active route for this tab
      if (tabId) {
        activeRoutes.set(tabId, route);
      }

      // Log routing decision
      if (route) {
        logger.info(`🎯 Route matched: ${route.name} (${url.substring(0, 50)}...) → ${host}:${port}`);
      } else {
        logger.info(`📤 Using default endpoint: ${host}:${port} for ${url.substring(0, 50)}...`);
      }

      // Send element with determined host and port
      elementSender.sendElement(
        request.data,
        host,
        port,
        (status, error) => {
          switch (status) {
            case ConnectionStatus.CONNECTING:
              logger.info(`🔄 Connecting to ${host}:${port}...`);
              break;
            case ConnectionStatus.CONNECTED:
              logger.info(`✅ Connected to ${host}:${port}`);
              break;
            case ConnectionStatus.SENDING:
              logger.info('📤 Sending element...');
              break;
            case ConnectionStatus.SENT:
              logger.info(`✓ Element sent to ${route?.name || 'default'} (${host}:${port})`);
              break;
            case ConnectionStatus.ERROR:
              logger.error(`❌ Failed to send to ${host}:${port}:`, error);
              break;
            default:
              break;
          }
        },
      );

      sendResponse({ success: true, route: route?.name || 'default', endpoint: `${host}:${port}` });
    }

    // Handle request for current route info (for popup)
    if (request.type === 'GET_ACTIVE_ROUTE') {
      const tabId = request.tabId;
      const route = tabId ? activeRoutes.get(tabId) : null;
      sendResponse({
        route: route ? { name: route.name, mcpPort: route.mcpPort } : null,
        config: {
          enabled: currentConfig.enabled,
          autoRouting: currentConfig.autoRouting,
          routeCount: currentConfig.routes.length,
        },
      });
    }

    // Handle request to test a specific route
    if (request.type === 'TEST_ROUTE') {
      const { url } = request;
      const { host, port, route } = getEndpointForUrl(url);
      sendResponse({
        matched: !!route,
        route: route ? { name: route.name, pattern: route.pattern } : null,
        endpoint: { host, port },
      });
    }

    return true; // Keep message channel open for async response
  });

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    logger.info('🎉 MCP Pointer Multi-Instance installed!');
    logger.info('📍 Default routes configured for multi-project workflow');
  }

  if (details.reason === 'update') {
    const { previousVersion } = details;
    const currentVersion = chrome.runtime.getManifest().version;

    logger.info(`🔄 Extension updated from ${previousVersion} to ${currentVersion}`);

    // Show update notification for major updates
    if (previousVersion && !previousVersion.startsWith('0.7')) {
      chrome.tabs.create({
        url: 'https://mcp-pointer.etsd.tech/multi-instance-update.html',
        active: true,
      });
    }
  }
});

// Clean up route tracking when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  activeRoutes.delete(tabId);
});

// Start initialization
initialize();
