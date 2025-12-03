import defaultConfig, { ExtensionConfig } from '../utils/config';
import logger from '../utils/logger';
import ConfigStorageService from './config-storage-service';

export default class PopupManagerService {
  private enabledInput: HTMLInputElement;

  private hostInput: HTMLInputElement;

  private portInput: HTMLInputElement;

  private saveBtn: HTMLButtonElement;

  private resetBtn: HTMLButtonElement;

  private status: HTMLElement;

  constructor() {
    this.enabledInput = document.getElementById('enabled') as HTMLInputElement;
    this.hostInput = document.getElementById('host') as HTMLInputElement;
    this.portInput = document.getElementById('port') as HTMLInputElement;
    this.saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;

    this.setupEventListeners();
    this.loadConfig();
  }

  private setupEventListeners(): void {
    this.saveBtn.addEventListener('click', () => this.saveConfig());
    this.resetBtn.addEventListener('click', () => this.resetToDefaults());
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await ConfigStorageService.load();

      this.enabledInput.checked = config.enabled;
      this.hostInput.value = config.websocket.host || 'localhost';
      this.portInput.value = config.websocket.port.toString();
    } catch (error) {
      this.showStatus('Failed to load configuration', 'error');
      logger.error('Error loading config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const host = this.hostInput.value.trim();
      if (!host) {
        this.showStatus('Host cannot be empty', 'error');
        return;
      }

      const port = parseInt(this.portInput.value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        this.showStatus('Port must be a number between 1 and 65535', 'error');
        return;
      }

      const config: ExtensionConfig = {
        enabled: this.enabledInput.checked,
        websocket: {
          host,
          port,
        },
        logger: {
          enabled: defaultConfig.logger.enabled,
          level: defaultConfig.logger.level,
        },
      };

      await ConfigStorageService.save(config);
      this.showStatus(`Settings saved (${host}:${port})`, 'success');
    } catch (error) {
      this.showStatus('Failed to save configuration', 'error');
      logger.error('Error saving config:', error);
    }
  }

  private async resetToDefaults(): Promise<void> {
    try {
      await ConfigStorageService.save(defaultConfig);
      await this.loadConfig();
      this.showStatus('Settings reset to defaults', 'success');
    } catch (error) {
      this.showStatus('Failed to reset configuration', 'error');
      logger.error('Error resetting config:', error);
    }
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    this.status.textContent = message;
    this.status.className = `status ${type} visible`;

    setTimeout(() => {
      this.status.classList.remove('visible');
    }, 3000);
  }
}
