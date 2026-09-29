export interface DailyUsageMap {
  [dateKey: string]: number; // Exemplo: { "2026-09-28": 420 } (em segundos)
}

export class ActiveTabTracker {
  private domain: string;
  private isTracking = false;
  private lastTick: number = Date.now();
  private lastUserActivity: number = Date.now();
  private accumulatedBufferSeconds = 0;

  private readonly idleThresholdMs = 60_000; // 60 segundos sem eventos = inativo
  private readonly flushIntervalMs = 5_000;  // Persiste a cada 5 segundos de uso contínuo
  private intervalId: number | null = null;

  constructor(domain: string) {
    this.domain = domain;
    this.bindEvents();
  }

  public start(): void {
    if (this.isTracking) return;

    this.isTracking = true;
    this.lastTick = Date.now();
    this.lastUserActivity = Date.now();

    this.intervalId = window.setInterval(() => this.tick(), 1000);
  }

  public stop(): void {
    if (!this.isTracking) return;

    this.tick();
    this.flushToStorage();

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isTracking = false;
  }

  private tick(): void {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - this.lastTick) / 1000);

    if (elapsedSeconds <= 0) return;
    this.lastTick = now;

    const isVisible = document.visibilityState === 'visible';
    const isFocused = document.hasFocus();
    const isUserActive = now - this.lastUserActivity < this.idleThresholdMs;

    if (isVisible && isFocused && isUserActive) {
      this.accumulatedBufferSeconds += elapsedSeconds;

      if (this.accumulatedBufferSeconds >= Math.floor(this.flushIntervalMs / 1000)) {
        this.flushToStorage();
      }
    }
  }

  private registerActivity(): void {
    this.lastUserActivity = Date.now();
  }

  private bindEvents(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushToStorage();
      } else {
        this.lastTick = Date.now();
        this.registerActivity();
      }
    });

    window.addEventListener('blur', () => this.flushToStorage());
    window.addEventListener('focus', () => {
      this.lastTick = Date.now();
      this.registerActivity();
    });

    const passiveOption: AddEventListenerOptions = { passive: true };
    window.addEventListener('mousemove', () => this.registerActivity(), passiveOption);
    window.addEventListener('keydown', () => this.registerActivity(), passiveOption);
    window.addEventListener('scroll', () => this.registerActivity(), passiveOption);
    window.addEventListener('click', () => this.registerActivity(), passiveOption);

    window.addEventListener('beforeunload', () => {
      this.stop();
    });
  }

  private flushToStorage(): void {
    if (this.accumulatedBufferSeconds <= 0) return;

    const secondsToAdd = this.accumulatedBufferSeconds;
    this.accumulatedBufferSeconds = 0;

    const today = new Date().toISOString().split('T')[0];
    const storageKey = `activeTime_${this.domain}`;

    chrome.storage.local.get([storageKey], (result) => {
      const dailyData: DailyUsageMap = (result[storageKey] as DailyUsageMap) || {};
      const currentSeconds = dailyData[today] || 0;

      dailyData[today] = currentSeconds + secondsToAdd;

      chrome.storage.local.set({ [storageKey]: dailyData });
    });
  }
}