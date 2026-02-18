// src/options/options.ts
// Options page logic

import './options.css';
import {
  ExtensionSettings,
  FilterMode,
  ExtensionMessage,
  DEFAULT_SETTINGS,
} from '../shared/types';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const thresholdSlider = document.getElementById('defaultThreshold') as HTMLInputElement;
const thresholdDisplay = document.getElementById('thresholdDisplay')!;
const modeRadios = document.querySelectorAll<HTMLInputElement>('input[name="defaultMode"]');
const minLengthSlider = document.getElementById('minLength') as HTMLInputElement;
const minLengthDisplay = document.getElementById('minLengthDisplay')!;
const domainInput = document.getElementById('domainInput') as HTMLInputElement;
const addDomainBtn = document.getElementById('addDomainBtn')!;
const domainListEl = document.getElementById('domainList')!;
const cacheCountEl = document.getElementById('cacheCount')!;
const clearCacheBtn = document.getElementById('clearCacheBtn')!;
const saveBtn = document.getElementById('saveBtn')!;
const resetBtn = document.getElementById('resetBtn')!;
const saveBanner = document.getElementById('saveBanner')!;

// ─── State ────────────────────────────────────────────────────────────────────

let settings: ExtensionSettings;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  settings = await fetchSettings();
  renderUI(settings);
  fetchCacheStats();
  setupSidebarNav();
}

function fetchSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' } as ExtensionMessage, (res) => {
      resolve(res?.settings ?? { ...DEFAULT_SETTINGS });
    });
  });
}

function fetchCacheStats() {
  chrome.runtime.sendMessage(
    { type: 'GET_CACHE_STATS' } as ExtensionMessage,
    (res) => {
      if (res?.count !== undefined) cacheCountEl.textContent = String(res.count);
    }
  );
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderUI(s: ExtensionSettings) {
  thresholdSlider.value = String(s.threshold);
  thresholdDisplay.textContent = String(s.threshold);
  updateSliderTrack(thresholdSlider, s.threshold, 1, 10);

  modeRadios.forEach((r) => { r.checked = r.value === s.mode; });

  minLengthSlider.value = String(s.minTextLength);
  minLengthDisplay.textContent = String(s.minTextLength);
  updateSliderTrackRaw(minLengthSlider, s.minTextLength, 20, 500);

  renderDomainList(s.domainRules);
}

function renderDomainList(rules: Record<string, string>) {
  const disabledDomains = Object.entries(rules)
    .filter(([, rule]) => rule === 'disabled')
    .map(([host]) => host);

  if (disabledDomains.length === 0) {
    domainListEl.innerHTML = '<p class="empty-state">No disabled domains yet.</p>';
    return;
  }

  domainListEl.innerHTML = '';
  for (const host of disabledDomains) {
    const tag = document.createElement('div');
    tag.className = 'domain-tag';
    tag.innerHTML = `
      <span>🚫 ${escapeHtml(host)}</span>
      <button class="domain-tag__remove" data-host="${escapeHtml(host)}" title="Remove">✕</button>
    `;
    tag.querySelector('.domain-tag__remove')!
      .addEventListener('click', () => removeDomain(host));
    domainListEl.appendChild(tag);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Slider Track ──────────────────────────────────────────────────────────────

function updateSliderTrack(input: HTMLInputElement, val: number, min: number, max: number) {
  const pct = ((val - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(to right, #6366f1 0%, #6366f1 ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`;
}

function updateSliderTrackRaw(input: HTMLInputElement, val: number, min: number, max: number) {
  updateSliderTrack(input, val, min, max);
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

function addDomain() {
  let host = domainInput.value.trim().toLowerCase();
  if (!host) return;
  // Strip protocol if provided
  host = host.replace(/^https?:\/\//i, '').split('/')[0];
  if (!host) return;

  settings.domainRules[host] = 'disabled';
  domainInput.value = '';
  renderDomainList(settings.domainRules);
}

function removeDomain(host: string) {
  delete settings.domainRules[host];
  renderDomainList(settings.domainRules);
}

// ─── Save ─────────────────────────────────────────────────────────────────────

function collectSettings(): ExtensionSettings {
  const threshold = Number(thresholdSlider.value);
  const mode = ([...modeRadios].find((r) => r.checked)?.value ?? 'blur') as FilterMode;
  const minTextLength = Number(minLengthSlider.value);

  return {
    ...settings,
    threshold,
    mode,
    minTextLength,
  };
}

function saveSettings() {
  const updated = collectSettings();
  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: updated,
  } as ExtensionMessage, () => {
    settings = updated;
    flashSaveBanner();
  });
}

function flashSaveBanner() {
  saveBanner.classList.remove('hidden');
  setTimeout(() => saveBanner.classList.add('hidden'), 2000);
}

function resetToDefaults() {
  if (!confirm('Reset all settings to defaults?')) return;
  settings = { ...DEFAULT_SETTINGS };
  renderUI(settings);
  saveSettings();
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

thresholdSlider.addEventListener('input', () => {
  const val = Number(thresholdSlider.value);
  thresholdDisplay.textContent = String(val);
  updateSliderTrack(thresholdSlider, val, 1, 10);
});

minLengthSlider.addEventListener('input', () => {
  const val = Number(minLengthSlider.value);
  minLengthDisplay.textContent = String(val);
  updateSliderTrackRaw(minLengthSlider, val, 20, 500);
});

addDomainBtn.addEventListener('click', addDomain);
domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addDomain(); });

clearCacheBtn.addEventListener('click', async () => {
  if (!confirm('Clear the score cache?')) return;
  // Send to background to clear persistent cache  
  chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: {} } as ExtensionMessage);
  // Clear via storage directly
  chrome.storage.local.remove('cl_score_cache', () => {
    cacheCountEl.textContent = '0';
    flashSaveBanner();
  });
});

saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetToDefaults);

// ─── Sidebar smooth scroll nav ────────────────────────────────────────────────

function setupSidebarNav() {
  document.querySelectorAll<HTMLAnchorElement>('.nav-item').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href') ?? '');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      document.querySelectorAll('.nav-item').forEach((l) => l.classList.remove('nav-item--active'));
      link.classList.add('nav-item--active');
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
