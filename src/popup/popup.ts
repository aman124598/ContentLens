// src/popup/popup.ts
// Popup UI logic

import './popup.css';
import { ExtensionSettings, FilterMode, ExtensionMessage, LicenseState, LicenseStatus, LS_CHECKOUT_URL, TRIAL_MS, TRIAL_DAYS } from '../shared/types';
import { trialCountdown } from '../shared/license';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const masterToggle = document.getElementById('masterToggle') as HTMLInputElement;
const thresholdSlider = document.getElementById('threshold') as HTMLInputElement;
const thresholdValue = document.getElementById('thresholdValue')!;
const modeRadios = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
const domainToggle = document.getElementById('domainToggle') as HTMLInputElement;
const currentHostEl = document.getElementById('currentHost')!;
const cacheCountEl = document.getElementById('cacheCount')!;
const openOptionsBtn = document.getElementById('openOptions')!;
const controls = document.getElementById('controls')!;
const disabledMsg = document.getElementById('disabledMsg')!;

// License UI
const licenseBar = document.getElementById('licenseBar')!;
const licenseBarText = document.getElementById('licenseBarText')!;
const licenseUpgradeBtn = document.getElementById('licenseUpgradeBtn') as HTMLAnchorElement;
const licensePanel = document.getElementById('licensePanel')!;
const licensePanelTitle = document.getElementById('licensePanelTitle')!;
const licensePanelSub = document.getElementById('licensePanelSub')!;
const licenseKeyInput = document.getElementById('licenseKeyInput') as HTMLInputElement;
const licenseActivateBtn = document.getElementById('licenseActivateBtn') as HTMLButtonElement;
const licenseError = document.getElementById('licenseError')!;
const licenseSuccess = document.getElementById('licenseSuccess')!;
const licenseBuyBtn = document.getElementById('licenseBuyBtn') as HTMLAnchorElement;

// ─── State ────────────────────────────────────────────────────────────────────

let settings: ExtensionSettings;
let currentHost = '';

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Fetch current tab hostname
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHost = tab?.url ? new URL(tab.url).hostname : '';
  currentHostEl.textContent = currentHost || 'N/A';

  // Fetch settings
  settings = await fetchSettings();
  renderUI(settings);

  // Fetch cache stats
  chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' } as ExtensionMessage, (res) => {
    if (res && typeof res.count === 'number') {
      cacheCountEl.textContent = String(res.count);
    }
  });

  // Fetch license state and render license UI
  await renderLicenseUI();
}

function fetchSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' } as ExtensionMessage, (res) => {
      resolve(res?.settings ?? {});
    });
  });
}

function fetchLicense(): Promise<{ state: LicenseState; status: LicenseStatus }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_LICENSE' } as ExtensionMessage, (res) => {
      resolve(res ?? { state: { installDate: Date.now(), licenseKey: null, licenseValid: false, licenseEmail: null, lastValidated: null }, status: 'trial' });
    });
  });
}

// ─── License UI ───────────────────────────────────────────────────────────────

async function renderLicenseUI() {
  const { state, status } = await fetchLicense();

  // Set buy button URL
  licenseBuyBtn.href = LS_CHECKOUT_URL;
  licenseUpgradeBtn.href = LS_CHECKOUT_URL;

  licenseBar.classList.remove('hidden', 'license-bar--expired');

  if (status === 'active' || status === 'grace') {
    // Paid user — show compact green confirmation, hide panel
    licenseBar.innerHTML = `✅ <strong>Licensed</strong>${state.licenseEmail ? ` · ${state.licenseEmail}` : ''} &nbsp;<button id="deactivateBtn" style="background:none;border:none;color:#6b7280;font-size:10px;cursor:pointer;text-decoration:underline;">Remove</button>`;
    licensePanel.classList.add('hidden');
    document.getElementById('deactivateBtn')?.addEventListener('click', deactivateLicense);
  } else if (status === 'trial') {
    const countdown = trialCountdown(state);
    licenseBarText.textContent = `🎁 Free trial: ${countdown}`;
    licenseUpgradeBtn.classList.remove('hidden');
    licensePanel.classList.remove('hidden');
    licensePanelTitle.textContent = 'Have a license key?';
    licensePanelSub.textContent = `Enter it below to unlock ContentLens after your ${TRIAL_DAYS}-day trial.`;
  } else {
    // Expired
    licenseBar.classList.add('license-bar--expired');
    licenseBarText.textContent = '⛔ Free trial ended';
    licenseUpgradeBtn.classList.remove('hidden');
    licensePanel.classList.remove('hidden');
    licensePanelTitle.textContent = 'Your free trial has ended';
    licensePanelSub.textContent = 'Get lifetime access for a one-time $5 payment, then enter your license key below.';
  }
}

licenseActivateBtn.addEventListener('click', async () => {
  const key = licenseKeyInput.value.trim();
  if (!key) {
    showLicenseError('Please enter your license key.');
    return;
  }

  licenseActivateBtn.disabled = true;
  licenseActivateBtn.textContent = 'Validating…';
  licenseError.classList.add('hidden');
  licenseSuccess.classList.add('hidden');

  chrome.runtime.sendMessage({ type: 'ACTIVATE_LICENSE', key } as ExtensionMessage, async (res) => {
    licenseActivateBtn.disabled = false;
    licenseActivateBtn.textContent = 'Activate';

    if (res?.ok) {
      licenseSuccess.textContent = '🎉 License activated! ContentLens is now unlocked.';
      licenseSuccess.classList.remove('hidden');
      licenseKeyInput.value = '';
      // Re-render license section
      await renderLicenseUI();
      // Trigger re-scan in active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'RE_EVALUATE' } as ExtensionMessage).catch(() => {});
    } else {
      showLicenseError(res?.error ?? 'Activation failed. Please check your key.');
    }
  });
});

async function deactivateLicense() {
  chrome.runtime.sendMessage({ type: 'DEACTIVATE_LICENSE' } as ExtensionMessage, async () => {
    await renderLicenseUI();
  });
}

function showLicenseError(msg: string) {
  licenseError.textContent = msg;
  licenseError.classList.remove('hidden');
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderUI(s: ExtensionSettings) {
  masterToggle.checked = s.enabled;
  thresholdSlider.value = String(s.threshold);
  thresholdValue.textContent = String(s.threshold);
  updateSliderTrack(s.threshold);

  modeRadios.forEach((radio) => {
    radio.checked = radio.value === s.mode;
  });

  const domainRule = s.domainRules[currentHost];
  domainToggle.checked = domainRule !== 'disabled';

  setControlsEnabled(s.enabled);
}

function setControlsEnabled(enabled: boolean) {
  if (enabled) {
    controls.classList.remove('disabled');
    disabledMsg.classList.add('hidden');
  } else {
    controls.classList.add('disabled');
    disabledMsg.classList.remove('hidden');
  }
}

function updateSliderTrack(value: number) {
  const pct = ((value - 1) / 9) * 100;
  thresholdSlider.style.background = `linear-gradient(to right, #6366f1 0%, #6366f1 ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`;
}

// ─── Persist settings ─────────────────────────────────────────────────────────

function persistSettings(partial: Partial<ExtensionSettings>) {
  settings = { ...settings, ...partial };
  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: partial,
  } as ExtensionMessage);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

masterToggle.addEventListener('change', () => {
  persistSettings({ enabled: masterToggle.checked });
  setControlsEnabled(masterToggle.checked);
});

thresholdSlider.addEventListener('input', () => {
  const val = Number(thresholdSlider.value);
  thresholdValue.textContent = String(val);
  updateSliderTrack(val);
});

thresholdSlider.addEventListener('change', () => {
  persistSettings({ threshold: Number(thresholdSlider.value) });
});

modeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      persistSettings({ mode: radio.value as FilterMode });
    }
  });
});

domainToggle.addEventListener('change', () => {
  if (!currentHost) return;
  const domainRules = { ...settings.domainRules };
  if (domainToggle.checked) {
    delete domainRules[currentHost];
  } else {
    domainRules[currentHost] = 'disabled';
  }
  persistSettings({ domainRules });
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
