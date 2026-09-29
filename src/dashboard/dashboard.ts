import { DailyUsageMap } from '../content/tracker';

function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function renderDashboard(): void {
  const keys = ['totalBlocked', 'activeTime_youtube.com', 'activeTime_instagram.com'];

  chrome.storage.local.get(keys, (data) => {
    const totalBlocked = (data.totalBlocked as number) || 0;
    const ytDaily = (data['activeTime_youtube.com'] as DailyUsageMap) || {};
    const igDaily = (data['activeTime_instagram.com'] as DailyUsageMap) || {};

    // 1. Atualizar métricas resumidas
    const elBlocked = document.getElementById('metric-blocked');
    const elActiveToday = document.getElementById('metric-active-today');
    const elAvgDaily = document.getElementById('metric-avg-daily');

    if (elBlocked) elBlocked.textContent = totalBlocked.toLocaleString('pt-BR');

    const days7 = getLast7Days();
    const today = days7[days7.length - 1];

    const todaySeconds = (ytDaily[today] || 0) + (igDaily[today] || 0);
    if (elActiveToday) elActiveToday.textContent = formatMinutes(todaySeconds);

    let total7dSeconds = 0;
    const dailyTotals: { date: string; label: string; minutes: number }[] = [];

    days7.forEach((dateStr) => {
      const daySec = (ytDaily[dateStr] || 0) + (igDaily[dateStr] || 0);
      const mins = Math.round(daySec / 60);
      total7dSeconds += daySec;

      const dateObj = new Date(dateStr + 'T00:00:00');
      const label = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      dailyTotals.push({ date: dateStr, label, minutes: mins });
    });

    const avgMinutes = Math.round(total7dSeconds / 7 / 60);
    if (elAvgDaily) elAvgDaily.textContent = `${avgMinutes} min`;

    // 2. Renderizar Gráfico de Barras
    const chartContainer = document.getElementById('chart-container');
    if (!chartContainer) return;

    chartContainer.innerHTML = '';
    const maxMin = Math.max(...dailyTotals.map((d) => d.minutes), 15); // Escala mínima de 15 min

    dailyTotals.forEach((d) => {
      const heightPercent = Math.max((d.minutes / maxMin) * 100, 3);

      const col = document.createElement('div');
      col.className = 'bar-col';
      col.innerHTML = `
        <span class="bar-val">${d.minutes > 0 ? d.minutes + 'm' : ''}</span>
        <div class="bar" style="height: ${heightPercent}%"></div>
        <span class="bar-label">${d.label}</span>
      `;
      chartContainer.appendChild(col);
    });
  });
}

// 4. Exportação Local-First (JSON)
function exportData(): void {
  chrome.storage.local.get(null, (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arandu-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// 5. Importação Local-First
function importData(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const parsed = JSON.parse(content);
      chrome.storage.local.clear(() => {
        chrome.storage.local.set(parsed, () => {
          alert('Dados restaurados com sucesso!');
          renderDashboard();
        });
      });
    } catch {
      alert('Erro ao importar o ficheiro. Certifique-se de que é um JSON válido do Arandu.');
    }
  };

  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  renderDashboard();

  document.getElementById('btn-export')?.addEventListener('click', exportData);

  const fileInput = document.getElementById('file-import') as HTMLInputElement;
  document.getElementById('btn-import-trigger')?.addEventListener('click', () => {
    fileInput?.click();
  });
  fileInput?.addEventListener('change', importData);
});