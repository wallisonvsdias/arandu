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

// Injeção ou atualização do bloco <style> no DOM
function applyStyles(rules: Rule[], userOverrides: Record<string, boolean>): void {
  const activeSelectors: string[] = [];

  for (const rule of rules) {
    // A preferência do utilizador sobrepõe o default do JSON
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

// 2. Contabilização reativa de elementos contidos
const interceptedNodes = new WeakSet<Node>();

function auditDOM(rules: Rule[], userOverrides: Record<string, boolean>): void {
  let newBlockedCount = 0;
  let newSecondsSaved = 0;

  for (const rule of rules) {
    const isEnabled = userOverrides[rule.id] !== undefined ? userOverrides[rule.id] : rule.enabled;
    if (!isEnabled) continue;

    const nodes = document.querySelectorAll(rule.selector);
    nodes.forEach((node) => {
      if (!interceptedNodes.has(node)) {
        interceptedNodes.add(node);
        newBlockedCount++;
        newSecondsSaved += rule.weightSeconds;
      }
    });
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

// Inicialização principal
if (currentConfig) {
  // Injeção imediata preliminar com defaults (previne flicker antes de consultar o storage)
  applyStyles(currentConfig.rules, {});

  // Consulta as preferências gravadas e ajusta
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

    // Escuta alterações feitas pelo utilizador no Popup em tempo real
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.rulePreferences) {
        const updatedOverrides = (changes.rulePreferences.newValue as Record<string, boolean>) || {};
        applyStyles(currentConfig.rules, updatedOverrides);
      }
    });
  });

  // Ativa o cronómetro de atenção ativa
  const tracker = new ActiveTabTracker(currentConfig.domain);
  tracker.start();
}

// Intercepta URLs do YouTube Shorts e Instagram Reels
function interceptDistractionUrls(): void {
  const hostname = window.location.hostname;
  const path = window.location.pathname;

  // 1. YouTube Shorts
  if (hostname.includes('youtube.com')) {
    if (path.startsWith('/shorts/')) {
      const videoId = path.split('/shorts/')[1]?.split(/[?&#]/)[0];
      if (videoId) {
        window.location.replace(`https://www.youtube.com/watch?v=${videoId}`);
      } else {
        window.location.replace('https://www.youtube.com/');
      }
    } else if (path === '/shorts' || path === '/shorts/') {
      window.location.replace('https://www.youtube.com/');
    }
  }

  // 2. Instagram Reels (loop infinito)
  if (hostname.includes('instagram.com')) {
    if (path.startsWith('/reels/')) {
      window.location.replace('https://www.instagram.com/');
    }
  }
}

// Monkeypatch do history.pushState para SPAs sem recarregamento
function listenSpaNavigation(callback: () => void): void {
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    callback();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    callback();
  };

  window.addEventListener('popstate', callback);
  window.addEventListener('yt-navigate-finish', callback);
}

// Execução imediata
interceptDistractionUrls();
listenSpaNavigation(interceptDistractionUrls);