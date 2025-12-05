import defaultConfig, { ExtensionConfig, RouteConfig, generateRouteId } from '../utils/config';
import logger from '../utils/logger';
import ConfigStorageService from './config-storage-service';

export default class PopupManagerService {
  private enabledInput: HTMLInputElement;
  private autoRoutingInput: HTMLInputElement;
  private hostInput: HTMLInputElement;
  private portInput: HTMLInputElement;
  private saveBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private status: HTMLElement;
  private routesList: HTMLElement;
  private addRouteBtn: HTMLButtonElement;
  private activeRouteEl: HTMLElement;

  // Modal elements
  private modal: HTMLElement;
  private modalTitle: HTMLElement;
  private routeForm: HTMLFormElement;
  private routeNameInput: HTMLInputElement;
  private routePatternInput: HTMLInputElement;
  private routePatternTypeSelect: HTMLSelectElement;
  private routeHostInput: HTMLInputElement;
  private routePortInput: HTMLInputElement;
  private closeModalBtn: HTMLButtonElement;
  private cancelRouteBtn: HTMLButtonElement;

  // Collapsible
  private toggleDefaultBtn: HTMLElement;
  private defaultSection: HTMLElement;

  // State
  private currentConfig: ExtensionConfig = defaultConfig;
  private editingRouteId: string | null = null;
  private currentTabUrl: string = '';

  constructor() {
    // Main form elements
    this.enabledInput = document.getElementById('enabled') as HTMLInputElement;
    this.autoRoutingInput = document.getElementById('autoRouting') as HTMLInputElement;
    this.hostInput = document.getElementById('host') as HTMLInputElement;
    this.portInput = document.getElementById('port') as HTMLInputElement;
    this.saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;
    this.routesList = document.getElementById('routesList') as HTMLElement;
    this.addRouteBtn = document.getElementById('addRouteBtn') as HTMLButtonElement;
    this.activeRouteEl = document.getElementById('activeRoute') as HTMLElement;

    // Modal elements
    this.modal = document.getElementById('routeModal') as HTMLElement;
    this.modalTitle = document.getElementById('modalTitle') as HTMLElement;
    this.routeForm = document.getElementById('routeForm') as HTMLFormElement;
    this.routeNameInput = document.getElementById('routeName') as HTMLInputElement;
    this.routePatternInput = document.getElementById('routePattern') as HTMLInputElement;
    this.routePatternTypeSelect = document.getElementById('routePatternType') as HTMLSelectElement;
    this.routeHostInput = document.getElementById('routeHost') as HTMLInputElement;
    this.routePortInput = document.getElementById('routePort') as HTMLInputElement;
    this.closeModalBtn = document.getElementById('closeModal') as HTMLButtonElement;
    this.cancelRouteBtn = document.getElementById('cancelRoute') as HTMLButtonElement;

    // Collapsible
    this.toggleDefaultBtn = document.getElementById('toggleDefault') as HTMLElement;
    this.defaultSection = document.getElementById('defaultSection') as HTMLElement;

    this.setupEventListeners();
    this.loadConfig();
    this.detectCurrentTabRoute();
  }

  private setupEventListeners(): void {
    this.saveBtn.addEventListener('click', () => this.saveConfig());
    this.resetBtn.addEventListener('click', () => this.resetToDefaults());
    this.addRouteBtn.addEventListener('click', () => this.openAddRouteModal());

    // Modal events
    this.closeModalBtn.addEventListener('click', () => this.closeModal());
    this.cancelRouteBtn.addEventListener('click', () => this.closeModal());
    this.routeForm.addEventListener('submit', (e) => this.handleRouteSubmit(e));
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Collapsible
    this.toggleDefaultBtn.addEventListener('click', () => {
      this.defaultSection.classList.toggle('collapsed');
    });
  }

  private async loadConfig(): Promise<void> {
    try {
      this.currentConfig = await ConfigStorageService.load();

      this.enabledInput.checked = this.currentConfig.enabled;
      this.autoRoutingInput.checked = this.currentConfig.autoRouting;
      this.hostInput.value = this.currentConfig.websocket.host || 'localhost';
      this.portInput.value = this.currentConfig.websocket.port.toString();

      this.renderRoutes();
    } catch (error) {
      this.showStatus('Failed to load configuration', 'error');
      logger.error('Error loading config:', error);
    }
  }

  private renderRoutes(): void {
    if (this.currentConfig.routes.length === 0) {
      this.routesList.innerHTML = '<div class="empty-routes">No routes configured. Click + to add one.</div>';
      return;
    }

    this.routesList.innerHTML = this.currentConfig.routes.map((route) => `
      <div class="route-item ${route.enabled ? '' : 'disabled'}" data-route-id="${route.id}">
        <input type="checkbox" class="route-toggle" ${route.enabled ? 'checked' : ''} data-route-id="${route.id}">
        <div class="route-info">
          <div class="route-name">${this.escapeHtml(route.name)}</div>
          <div class="route-details">
            <span class="route-pattern">:${route.pattern}</span>
            <span>${route.host}:${route.port}</span>
          </div>
        </div>
        <div class="route-actions">
          <button type="button" class="btn-icon edit-route" data-route-id="${route.id}" title="Edit">✎</button>
          <button type="button" class="btn-icon delete delete-route" data-route-id="${route.id}" title="Delete">×</button>
        </div>
      </div>
    `).join('');

    // Add event listeners to route items
    this.routesList.querySelectorAll('.route-toggle').forEach((el) => {
      el.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const routeId = target.dataset.routeId;
        if (routeId) this.toggleRoute(routeId);
      });
    });

    this.routesList.querySelectorAll('.edit-route').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const routeId = target.dataset.routeId;
        if (routeId) this.openEditRouteModal(routeId);
      });
    });

    this.routesList.querySelectorAll('.delete-route').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const routeId = target.dataset.routeId;
        if (routeId) this.deleteRoute(routeId);
      });
    });
  }

  private async detectCurrentTabRoute(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        this.currentTabUrl = tab.url;

        // Ask background script which route matches
        chrome.runtime.sendMessage(
          { type: 'TEST_ROUTE', url: tab.url },
          (response) => {
            if (response?.matched && response.route) {
              this.activeRouteEl.textContent = `${response.route.name} → ${response.endpoint.host}:${response.endpoint.port}`;
              // Highlight matching route in list
              this.highlightActiveRoute(response.route.name);
            } else {
              this.activeRouteEl.textContent = `Default → ${this.currentConfig.websocket.host}:${this.currentConfig.websocket.port}`;
            }
          }
        );
      } else {
        this.activeRouteEl.textContent = 'No active tab detected';
      }
    } catch (error) {
      this.activeRouteEl.textContent = 'Unable to detect';
      logger.error('Error detecting tab:', error);
    }
  }

  private highlightActiveRoute(routeName: string): void {
    // Remove previous highlights
    this.routesList.querySelectorAll('.route-item').forEach((el) => {
      el.classList.remove('active');
    });

    // Find and highlight matching route
    const route = this.currentConfig.routes.find((r) => r.name === routeName);
    if (route) {
      const el = this.routesList.querySelector(`[data-route-id="${route.id}"]`);
      if (el) el.classList.add('active');
    }
  }

  private openAddRouteModal(): void {
    this.editingRouteId = null;
    this.modalTitle.textContent = 'Add Route';
    this.routeForm.reset();
    this.routeHostInput.value = this.currentConfig.websocket.host;
    this.modal.classList.add('visible');
  }

  private openEditRouteModal(routeId: string): void {
    const route = this.currentConfig.routes.find((r) => r.id === routeId);
    if (!route) return;

    this.editingRouteId = routeId;
    this.modalTitle.textContent = 'Edit Route';
    this.routeNameInput.value = route.name;
    this.routePatternInput.value = route.pattern;
    this.routePatternTypeSelect.value = route.patternType;
    this.routeHostInput.value = route.host;
    this.routePortInput.value = route.port.toString();
    this.modal.classList.add('visible');
  }

  private closeModal(): void {
    this.modal.classList.remove('visible');
    this.editingRouteId = null;
  }

  private async handleRouteSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const name = this.routeNameInput.value.trim();
    const pattern = this.routePatternInput.value.trim();
    const patternType = this.routePatternTypeSelect.value as 'port' | 'contains' | 'regex';
    const host = this.routeHostInput.value.trim();
    const port = parseInt(this.routePortInput.value, 10);

    if (!name || !pattern || !host || isNaN(port)) {
      this.showStatus('Please fill all fields', 'error');
      return;
    }

    if (this.editingRouteId) {
      // Update existing route
      const newRoutes = this.currentConfig.routes.map((route) =>
        route.id === this.editingRouteId
          ? { ...route, name, pattern, patternType, host, port }
          : route
      );
      this.currentConfig = { ...this.currentConfig, routes: newRoutes };
    } else {
      // Add new route
      const newRoute: RouteConfig = {
        id: generateRouteId(),
        name,
        pattern,
        patternType,
        host,
        port,
        enabled: true,
      };
      this.currentConfig = {
        ...this.currentConfig,
        routes: [...this.currentConfig.routes, newRoute],
      };
    }

    this.renderRoutes();
    this.closeModal();
    this.showStatus('Route saved (click Save to persist)', 'success');
  }

  private async toggleRoute(routeId: string): Promise<void> {
    const newRoutes = this.currentConfig.routes.map((route) =>
      route.id === routeId ? { ...route, enabled: !route.enabled } : route
    );
    this.currentConfig = { ...this.currentConfig, routes: newRoutes };
    this.renderRoutes();
  }

  private async deleteRoute(routeId: string): Promise<void> {
    if (!confirm('Delete this route?')) return;

    const newRoutes = this.currentConfig.routes.filter((route) => route.id !== routeId);
    this.currentConfig = { ...this.currentConfig, routes: newRoutes };
    this.renderRoutes();
    this.showStatus('Route deleted (click Save to persist)', 'success');
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
        autoRouting: this.autoRoutingInput.checked,
        websocket: { host, port },
        routes: this.currentConfig.routes,
        logger: this.currentConfig.logger,
      };

      await ConfigStorageService.save(config);
      this.currentConfig = config;
      this.showStatus(`Settings saved! ${config.routes.length} routes configured.`, 'success');
      this.detectCurrentTabRoute();
    } catch (error) {
      this.showStatus('Failed to save configuration', 'error');
      logger.error('Error saving config:', error);
    }
  }

  private async resetToDefaults(): Promise<void> {
    if (!confirm('Reset all settings and routes to defaults?')) return;

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

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
