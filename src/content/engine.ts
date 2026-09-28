import { Rule, PlatformConfig } from '../types/rule';
import youtubeData from '../rules/youtube.json';

const configs: Record<string, PlatformConfig> = {
  'youtube.com': youtubeData as PlatformConfig,
};

// Determina as regras ativas de acordo com o domínio corrente
function getActiveRules(): Rule[] {
  const hostname = window.location.hostname;
  for (const domain in configs) {
    if (hostname.includes(domain)) {
      return configs[domain].rules.filter((rule) => rule.enabled);
    }
  }
  return [];
}

const activeRules = getActiveRules();

// 1. Injeção preventiva de estilo para eliminar flicker
function injectBlockingStyles(rules: Rule[]): void {
  if (rules.length === 0) return;

  const css = rules
    .map((rule) => `${rule.selector} { display: none !important; }`)
    .join('\n');

  const styleElement = document.createElement('style');
  styleElement.id = 'arandu-injected-styles';
  styleElement.textContent = css;

  const target = document.head || document.documentElement;
  if (target) {
    target.appendChild(styleElement);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      (document.head || document.documentElement).appendChild(styleElement);
    });
  }
}

// 2. Contabilização reativa de elementos interceptados
const interceptedNodes = new WeakSet<Node>();

function auditDOM(rules: Rule[]): void {
  let newBlockedCount = 0;
  let newSecondsSaved = 0;

  for (const rule of rules) {
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

// 3. Persistência local no motor do navegador (Local-First)
function persistMetrics(count: number, seconds: number): void {
  chrome.storage.local.get(['totalBlocked', 'totalSecondsSaved'], (data) => {
    const currentBlocked = (data.totalBlocked as number) || 0;
    const currentSeconds = (data.totalSecondsSaved as number) || 0;

    const totalBlocked = currentBlocked + count;
    const totalSecondsSaved = currentSeconds + seconds;

    chrome.storage.local.set({
      totalBlocked,
      totalSecondsSaved,
      lastUpdated: new Date().toISOString(),
    });
  });
}

// Execução inicial imediata
if (activeRules.length > 0) {
  injectBlockingStyles(activeRules);

  const observer = new MutationObserver(() => {
    auditDOM(activeRules);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}