import type { GameDebugService } from './GameDebugService';

/** Read-only serializable snapshots for browser tools isolated from page JavaScript globals. */
export class GameDebugDomBridge {
  private readonly element: HTMLOutputElement;
  private readonly timer: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(debug: GameDebugService, read: () => unknown = () => debug.snapshot(), document: Document = window.document) {
    if (document.getElementById('game-debug')) throw new Error('GameDebug DOM bridge already attached');
    this.element = document.createElement('output');
    this.element.id = 'game-debug';
    this.element.hidden = true;
    document.body.appendChild(this.element);
    const refresh = () => {
      try { this.element.setAttribute('data-state', JSON.stringify(read())); }
      catch (error) { this.element.setAttribute('data-state', JSON.stringify({ bridgeError: String(error) })); }
    };
    refresh();
    this.timer = setInterval(refresh, 100);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.element.remove();
  }
}
