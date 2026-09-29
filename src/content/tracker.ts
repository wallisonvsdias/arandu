interface StorageDailyTime {
  [dateKey: string]: number; // Armazena segundos acumulados por dia: { "2026-09-28": 420 }
}

export class ActiveTabTracker {
  private domain: string;
  private isTracking = false;
  private lastTick: number = Date.now();
  private lastUserActivity: number = Date.now();
  private accumulatedBufferSeconds = 0;

  // Parâmetros de calibração
  private readonly idleThresholdMs = 60_000; // 60 segundos sem interação = pausa
  private readonly flushIntervalMs = 5_000;  // Grava no storage a cada 5 segundos
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

    // Executa a verificação a cada 1 segundo
    this.intervalId = window.setInterval(() => this.tick(), 1000);
  }

  public stop(): void {
    if (!this.isTracking) return;

    this.tick(); // Processa segundos residuais
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

    // Condição estrita de presença ativa:
    // 1. Aba visível na tela
    // 2. Janela com foco no sistema operacional
    // 3. Usuário interagiu nos últimos 60 segundos
    const isVisible = document.visibilityState === 'visible';
    const isFocused = document.hasFocus();
    const isUserActive = now - this.lastUserActivity < this.idleThresholdMs;

    if (isVisible && isFocused && isUserActive) {
      this.accumulatedBufferSeconds += elapsedSeconds;

      // Descarrega no disco periodicamente para evitar perdas se a aba fechar de repente
      if (this.accumulatedBufferSeconds >= Math.floor(this.flushIntervalMs / 1000)) {
        this.flushToStorage();
      }
    }
  }

  private registerActivity(): void {
    this.lastUserActivity = Date.now();
  }

  private bindEvents(): void {
    // 1. Mudança de visibilidade de aba (minimizar ou trocar de aba)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushToStorage();
      } else {
        this.lastTick = Date.now();
        this.registerActivity();
      }
    });

    // 2. Foco e perda de foco da janela (alt-tab ou clique fora do navegador)
    window.addEventListener('blur', () => this.flushToStorage());
    window.addEventListener('focus', () => {
      this.lastTick = Date.now();
      this.registerActivity();
    });

    // 3. Detecção de atividade física (mouse, teclado e scroll)
    const passiveConfig: AddEventListenerOptions = { passive: true };
    window.addEventListener('mousemove', () => this.registerActivity(), passiveConfig);
    window.addEventListener('keydown', () => this.registerActivity(), passiveConfig);
    window.addEventListener('scroll', () => this.registerActivity(), passiveConfig);
    window.addEventListener('click', () => this.registerActivity(), passiveConfig);

    // 4. Fechamento ou recarregamento abrupto da página
    window.addEventListener('beforeunload', () => {
      this.stop();
    });
  }

  private flushToStorage(): void {
    if (this.accumulatedBufferSeconds <= 0) return;

    const secondsToAdd = this.accumulatedBufferSeconds;
    this.accumulatedBufferSeconds = 0;

    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    const storageKey = `activeTime_${this.domain}`;

    chrome.storage.local.get([storageKey], (result) => {
      const dailyData: StorageDailyTime = (result[storageKey] as StorageDailyTime) || {};
      const currentTodaySeconds = dailyData[today] || 0;

      dailyData[today] = currentTodaySeconds + secondsToAdd;

      chrome.storage.local.set({ [storageKey]: dailyData });
    });
  }
}