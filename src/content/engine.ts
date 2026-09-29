import { Rule, PlatformConfig } from '../types/rule';
import youtubeData from '../rules/youtube.json';
import instagramData from '../rules/instagram.json';
import { ActiveTabTracker } from './tracker';

const configs: Record<string, PlatformConfig> = {
  'youtube.com': youtubeData as PlatformConfig,
  'instagram.com': instagramData as PlatformConfig,
};

function isContextValid(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

function getPlatformConfig(): PlatformConfig | null {
  const hostname = window.location.hostname;
  for (const domain in configs) {
    if (hostname.includes(domain)) {
      return configs[domain];
    }
  }
  return null;
}

const currentConfig = getPlatformConfig();

// Injeta estilos CSS no nó raiz
function applyStyles(rules: Rule[], userOverrides: Record<string, boolean>): void {
  const activeSelectors: string[] = [];

  for (const rule of rules) {
    const isEnabled = userOverrides[rule.id] !== undefined ? userOverrides[rule.id] : rule.enabled;
    if (isEnabled) {
      activeSelectors.push(`${rule.selector} { display: none !important; }`);
    }
  }

  let styleElement = document.getElementById('arandu-injected-styles') as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'arandu-injected-styles';
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleElement);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        (document.head || document.documentElement).appendChild(styleElement!);
      });
    }
  }

  styleElement.textContent = activeSelectors.join('\n');
}

// Contabilização segura com isolamento de erros de seletor
const interceptedNodes = new WeakSet<Node>();

function auditDOM(rules: Rule[], userOverrides: Record<string, boolean>): void {
  let newBlockedCount = 0;
  let newSecondsSaved = 0;

  for (const rule of rules) {
    const isEnabled = userOverrides[rule.id] !== undefined ? userOverrides[rule.id] : rule.enabled;
    if (!isEnabled) continue;

    try {
      const nodes = document.querySelectorAll(rule.selector);
      nodes.forEach((node) => {
        if (!interceptedNodes.has(node)) {
          interceptedNodes.add(node);
          newBlockedCount++;
          newSecondsSaved += rule.weightSeconds;
        }
      });
    } catch {
      // Ignora seletores que o navegador possa rejeitar temporariamente em mutações do DOM
    }
  }

  if (newBlockedCount > 0) {
    persistMetrics(newBlockedCount, newSecondsSaved);
  }
}

function persistMetrics(count: number, seconds: number): void {
  if (!isContextValid()) return;

  try {
    chrome.storage.local.get(['totalBlocked', 'totalSecondsSaved'], (data) => {
      if (chrome.runtime.lastError || !isContextValid()) return;

      const currentBlocked = (data.totalBlocked as number) || 0;
      const currentSeconds = (data.totalSecondsSaved as number) || 0;

      chrome.storage.local.set({
        totalBlocked: currentBlocked + count,
        totalSecondsSaved: currentSeconds + seconds,
        lastUpdated: new Date().toISOString(),
      });
    });
  } catch {
    // Contexto descarregado
  }
}

// Interceptador de navegação SPA seguro
let previousUrl = window.location.href;

function checkUrlAndIntercept(): void {
  const currentUrl = window.location.href;
  const path = window.location.pathname;

  // Interceptação do YouTube Shorts
  if (window.location.hostname.includes('youtube.com')) {
    if (path.startsWith('/shorts/')) {
      const videoId = path.split('/shorts/')[1]?.split(/[?&#]/)[0];
      if (videoId) {
        window.location.replace(`https://www.youtube.com/watch?v=${videoId}`);
        return;
      }
    } else if (path === '/shorts' || path === '/shorts/') {
      window.location.replace('https://www.youtube.com/');
      return;
    }
  }

  // Interceptação do Instagram Reels
  if (window.location.hostname.includes('instagram.com')) {
    if (path.startsWith('/reels/')) {
      window.location.replace('https://www.instagram.com/');
      return;
    }
  }

  previousUrl = currentUrl;
}

// Inicialização principal
if (currentConfig) {
  applyStyles(currentConfig.rules, {});

  chrome.storage.local.get(['rulePreferences'], (data) => {
    const userOverrides = (data.rulePreferences as Record<string, boolean>) || {};
    applyStyles(currentConfig.rules, userOverrides);

    const observer = new MutationObserver(() => {
      auditDOM(currentConfig.rules, userOverrides);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.rulePreferences) {
        const updatedOverrides = (changes.rulePreferences.newValue as Record<string, boolean>) || {};
        applyStyles(currentConfig.rules, updatedOverrides);
      }
    });
  });

  checkUrlAndIntercept();
  window.addEventListener('popstate', checkUrlAndIntercept);
  window.addEventListener('yt-navigate-finish', checkUrlAndIntercept);
  setInterval(checkUrlAndIntercept, 600);

  const tracker = new ActiveTabTracker(currentConfig.domain);
  tracker.start();
}