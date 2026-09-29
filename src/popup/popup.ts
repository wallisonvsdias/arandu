import { DailyUsageMap } from '../content/tracker';

function formatActiveTime(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function renderMetrics(): void {
  const activeTodayElement = document.getElementById('active-today');
  const blockedCountElement = document.getElementById('blocked-count');

  const today = new Date().toISOString().split('T')[0];
  const keysToQuery = [
    'totalBlocked',
    'activeTime_youtube.com',
    'activeTime_instagram.com',
  ];

  chrome.storage.local.get(keysToQuery, (data) => {
    // 1. Total de gatilhos barrados acumulados
    const totalBlocked = (data.totalBlocked as number) || 0;

    // 2. Soma do tempo ativo de hoje entre YouTube e Instagram
    const ytDaily = (data['activeTime_youtube.com'] as DailyUsageMap) || {};
    const igDaily = (data['activeTime_instagram.com'] as DailyUsageMap) || {};

    const todaySeconds = (ytDaily[today] || 0) + (igDaily[today] || 0);

    if (activeTodayElement) {
      activeTodayElement.textContent = formatActiveTime(todaySeconds);
    }

    if (blockedCountElement) {
      blockedCountElement.textContent = totalBlocked.toLocaleString('pt-BR');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderMetrics();

  // Atualização em tempo real quando o storage sofrer alterações
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      renderMetrics();
    }
  });
});