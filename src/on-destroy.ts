export abstract class OnDestroy {

  /**
   * Register event listeners for unexpected termination of the app
   */
  constructor() {
    process.on('SIGINT', this.destroy);
    process.on('SIGQUIT', this.destroy);
    process.on('SIGTERM', this.destroy);
    process.on('uncaughtExceptionMonitor', this.destroy);
  }

  /**
   * Synchronously handle releasing active resources
   */
  protected abstract destroy(): void;
}
