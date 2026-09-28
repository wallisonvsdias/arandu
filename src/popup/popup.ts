function formatTime(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = (minutes / 60).toFixed(1);
  return `${hours}h`;
}

function updateUI(blocked: number, seconds: number): void {
  const timeElement = document.getElementById('saved-time');
  const countElement = document.getElementById('blocked-count');

  if (timeElement) {
    timeElement.textContent = formatTime(seconds);
  }

  if (countElement) {
    countElement.textContent = blocked.toLocaleString('pt-BR');
  }
}

function loadInitialMetrics(): void {
  chrome.storage.local.get(['totalBlocked', 'totalSecondsSaved'], (data) => {
    const blocked = (data.totalBlocked as number) || 0;
    const seconds = (data.totalSecondsSaved as number) || 0;
    updateUI(blocked, seconds);
  });
}

// 1. Carrega dados ao abrir a janela
document.addEventListener('DOMContentLoaded', () => {
  loadInitialMetrics();

  // 2. Escuta alterações em tempo real via background/content script
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      chrome.storage.local.get(['totalBlocked', 'totalSecondsSaved'], (data) => {
        const blocked = (data.totalBlocked as number) || 0;
        const seconds = (data.totalSecondsSaved as number) || 0;
        updateUI(blocked, seconds);
      });
    }
  });
});