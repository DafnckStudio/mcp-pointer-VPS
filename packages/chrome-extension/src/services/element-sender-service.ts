import ReconnectingWebSocket from 'reconnecting-websocket';
import {
  RawPointedDOMElement, PointerMessage, PointerMessageType, ConnectionStatus,
} from '@mcp-pointer/shared/types';
import logger from '../utils/logger';

export type StatusCallback = (status: ConnectionStatus, error?: string) => void;

export class ElementSenderService {
  private ws: ReconnectingWebSocket | null = null;

  private currentHost: string | null = null;

  private currentPort: number | null = null;

  private idleTimeout: NodeJS.Timeout | null = null;

  private readonly IDLE_DURATION = 10000; // 10 seconds of inactivity

  private readonly CONNECTION_TIMEOUT = 10000; // 5 seconds to wait for connection

  private readonly MAX_RECONNECTION_DELAY = 10000; // 10 seconds max delay

  private readonly MIN_RECONNECTION_DELAY = 1000; // 1 second min delay

  private readonly RECONNECTION_DELAY_GROW_FACTOR = 1.5; // Exponential backoff factor

  private readonly MAX_RETRIES = 10; // Maximum connection retry attempts

  async sendElement(
    element: RawPointedDOMElement,
    host: string,
    port: number,
    statusCallback?: StatusCallback,
  ): Promise<void> {
    try {
      // Clear any existing idle timer
      this.clearIdleTimer();

      // Ensure we have a connection
      const connected = await this.ensureConnection(host, port, statusCallback);
      if (!connected) return;

      // Start idle timer just before sending
      this.startIdleTimer();

      // Now sending the element
      statusCallback?.(ConnectionStatus.SENDING);

      const message: PointerMessage = {
        type: PointerMessageType.DOM_ELEMENT_POINTED,
        data: element,
        timestamp: Date.now(),
      };

      this.ws!.send(JSON.stringify(message));
      logger.info('📤 Element sent:', element);

      // Successfully sent
      statusCallback?.(ConnectionStatus.SENT);
    } catch (error) {
      logger.error('Failed to send element:', error);
      statusCallback?.(ConnectionStatus.ERROR, (error as Error).message);
    }
  }

  private handleConnectionChange(host: string, port: number, statusCallback?: StatusCallback): boolean {
    if (!host || host.trim() === '') {
      statusCallback?.(ConnectionStatus.ERROR, 'Invalid host');
      return false;
    }

    if (!port || port <= 0 || port > 65535) {
      statusCallback?.(ConnectionStatus.ERROR, 'Invalid port number');
      return false;
    }

    const isInitialization = this.currentHost === null && this.currentPort === null;

    if (isInitialization) {
      this.currentHost = host;
      this.currentPort = port;
      return true;
    }

    const hostChanged = this.currentHost !== host;
    const portChanged = this.currentPort !== port;

    // Check if host or port changed - if so, disconnect old connection
    if (hostChanged || portChanged) {
      logger.info(`Connection changed from ${this.currentHost}:${this.currentPort} to ${host}:${port}, reconnecting...`);
      this.disconnect();
      this.currentHost = host;
      this.currentPort = port;
    }

    return true;
  }

  private async ensureConnection(host: string, port: number, statusCallback?: StatusCallback): Promise<boolean> {
    // Handle host/port change or initialization
    const connectionHandled = this.handleConnectionChange(host, port, statusCallback);
    if (!connectionHandled) return false;

    // Create connection if needed
    if (!this.isConnected) {
      statusCallback?.(ConnectionStatus.CONNECTING);

      // Create ReconnectingWebSocket with options
      // Use configured host instead of hardcoded 'localhost' for remote VPS support
      this.ws = new ReconnectingWebSocket(`ws://${host}:${port}`, [], {
        maxReconnectionDelay: this.MAX_RECONNECTION_DELAY,
        minReconnectionDelay: this.MIN_RECONNECTION_DELAY,
        reconnectionDelayGrowFactor: this.RECONNECTION_DELAY_GROW_FACTOR,
        connectionTimeout: this.CONNECTION_TIMEOUT,
        maxRetries: this.MAX_RETRIES,
      });

      this.setupHandlers();

      // Wait for connection to open
      const connected = await this.waitForConnection();
      if (!connected) {
        statusCallback?.(ConnectionStatus.ERROR, `Connection timeout to ${host}:${port}`);
        this.disconnect();
        return false;
      }
    }

    // Connection established
    statusCallback?.(ConnectionStatus.CONNECTED);

    return true;
  }

  private waitForConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.ws) {
        resolve(false);
        return;
      }

      if (this.ws.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, this.CONNECTION_TIMEOUT);

      const handleOpen = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      this.ws.addEventListener('open', handleOpen);
    });
  }

  private setupHandlers(): void {
    if (!this.ws) return;

    this.ws.addEventListener('open', () => {
      logger.info('✅ WebSocket connected');
    });

    this.ws.addEventListener('close', () => {
      logger.info('WebSocket closed');
    });

    this.ws.addEventListener('error', (error) => {
      logger.error('WebSocket error:', error);
    });

    this.ws.addEventListener('message', (event) => {
      logger.debug('Received:', event.data);
    });
  }

  private startIdleTimer(): void {
    this.idleTimeout = setTimeout(() => {
      this.disconnect();
      logger.info('🔌 Connection idle, disconnecting');
    }, this.IDLE_DURATION);
  }

  private clearIdleTimer(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  private disconnect(): void {
    this.clearIdleTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.debug('🔌 WS client disconnected');
  }

  private get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
