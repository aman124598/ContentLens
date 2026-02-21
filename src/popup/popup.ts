// src/popup/popup.ts
// Popup UI logic

import './popup.css';
import { AccessGate, ExtensionSettings, FilterMode, ExtensionMessage, LicenseState, LicenseStatus, AuthSession, DODO_PAYMENT_LINK, TRIAL_DAYS } from '../shared/types';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const masterToggle = document.getElementById('masterToggle') as HTMLInputElement;
const thresholdSlider = document.getElementById('threshold') as HTMLInputElement;
const thresholdValue = document.getElementById('thresholdValue')!;
const modeRadios = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
const domainToggle = document.getElementById('domainToggle') as HTMLInputElement;
const allowlistToggle = document.getElementById('allowlistToggle') as HTMLInputElement;
const allowlistSub = document.getElementById('allowlistSub')!;
const domainHint = document.getElementById('domainHint')!;
const enabledSitesList = document.getElementById('enabledSitesList')!;
const enabledSitesUl = document.getElementById('enabledSitesUl')!;
const currentHostEl = document.getElementById('currentHost')!;
const cacheCountEl = document.getElementById('cacheCount')!;
const openOptionsBtn = document.getElementById('openOptions')!;
const controls = document.getElementById('controls')!;
const disabledMsg = document.getElementById('disabledMsg')!;

// Auth wall
const authWall = document.getElementById('authWall')!;
const authTabLogin = document.getElementById('authTabLogin') as HTMLButtonElement;
const authTabSignup = document.getElementById('authTabSignup') as HTMLButtonElement;
const authEmail = document.getElementById('authEmail') as HTMLInputElement;
const authPassword = document.getElementById('authPassword') as HTMLInputElement;
const authConfirmHint = document.getElementById('authConfirmHint')!;
const authSubmitBtn = document.getElementById('authSubmitBtn') as HTMLButtonElement;
const authError = document.getElementById('authError')!;
const authSuccess = document.getElementById('authSuccess')!;

// Main popup wrapper (everything except authWall)
const popup = document.querySelector('.popup') as HTMLElement;

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
let authMode: 'login' | 'signup' = 'login';
let authSession: AuthSession | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // ── Step 1: Check authentication ───────────────────────────────────────────
  authSession = await fetchAuthSession();

  if (!authSession) {
    // Not signed in — show auth wall, hide main UI
    showAuthWall();
    return;
  }

  // ── Step 2: Signed in — show main UI ───────────────────────────────────────
  hideAuthWall();
  await initMainUI();
}

function fetchAuthSession(): Promise<AuthSession | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'AUTH_GET_SESSION' } as ExtensionMessage, (res) => {
      if (chrome.runtime.lastError || !res) { resolve(null); return; }
      resolve(res.session ?? null);
    });
  });
}

// ─── Auth wall show/hide ──────────────────────────────────────────────────────

function showAuthWall() {
  authWall.classList.remove('hidden');
  // Hide entire popup contents except the auth wall
  Array.from(popup.children).forEach((el) => {
    if (el !== authWall) (el as HTMLElement).style.display = 'none';
  });
}

function hideAuthWall() {
  authWall.classList.add('hidden');
  Array.from(popup.children).forEach((el) => {
    if (el !== authWall) (el as HTMLElement).style.removeProperty('display');
  });
}

// ─── Auth tab switching ───────────────────────────────────────────────────────

authTabLogin.addEventListener('click', () => {
  authMode = 'login';
  authTabLogin.classList.add('active');
  authTabSignup.classList.remove('active');
  authSubmitBtn.textContent = 'Sign In';
  authConfirmHint.classList.add('hidden');
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
});

authTabSignup.addEventListener('click', () => {
  authMode = 'signup';
  authTabSignup.classList.add('active');
  authTabLogin.classList.remove('active');
  authSubmitBtn.textContent = 'Create Account';
  authConfirmHint.classList.remove('hidden');
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
});

// ─── Auth form submit ─────────────────────────────────────────────────────────

authSubmitBtn.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    showAuthError('Please enter your email and password.');
    return;
  }
  if (authMode === 'signup' && password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');

  const msgType = authMode === 'login' ? 'AUTH_SIGN_IN' : 'AUTH_SIGN_UP';
  chrome.runtime.sendMessage({ type: msgType, email, password } as ExtensionMessage, async (res) => {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';

    if (!res?.ok) {
      showAuthError(res?.error ?? 'Authentication failed. Please try again.');
      return;
    }

    if (authMode === 'signup') {
      // Supabase sends confirmation email — inform user
      authSuccess.textContent = '✅ Account created! Check your email to confirm, then sign in.';
      authSuccess.classList.remove('hidden');
      // Switch to login tab
      authTabLogin.click();
      return;
    }

    // Signed in — reload the popup
    authSession = res.session ?? null;
    if (authSession) {
      hideAuthWall();
      await initMainUI();
    }
  });
});

function showAuthError(msg: string) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

// ─── Main UI init (after auth confirmed) ─────────────────────────────────────

async function initMainUI() {
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

function fetchAccessGate(): Promise<AccessGate> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ACCESS_GATE' } as ExtensionMessage, (res) => {
      if (!res?.gate) {
        resolve({
          allowed: false,
          status: 'expired',
          reason: 'blocked_unknown',
          daysLeft: 0,
          requiresAuth: false,
        });
        return;
      }
      resolve(res.gate as AccessGate);
    });
  });
}

// ─── License UI ───────────────────────────────────────────────────────────────

async function renderLicenseUI() {
  const [{ state }, gate] = await Promise.all([fetchLicense(), fetchAccessGate()]);
  const status = gate.status;

  // Set buy button URL
  licenseBuyBtn.href = DODO_PAYMENT_LINK;
  licenseUpgradeBtn.href = DODO_PAYMENT_LINK;

  licenseBar.classList.remove('hidden', 'license-bar--expired');

  if (status === 'active' || status === 'grace') {
    // Paid user — show compact green confirmation, hide panel
    const emailLabel = state.licenseEmail ?? authSession?.email ?? '';
    licenseBar.innerHTML = `✅ <strong>Licensed</strong>${emailLabel ? ` · ${emailLabel}` : ''} &nbsp;<button id="deactivateBtn" style="background:none;border:none;color:#6b7280;font-size:10px;cursor:pointer;text-decoration:underline;">Remove</button> <button id="signOutBtn" style="background:none;border:none;color:#6b7280;font-size:10px;cursor:pointer;text-decoration:underline;margin-left:4px;">Sign out</button>`;
    licensePanel.classList.add('hidden');
    document.getElementById('deactivateBtn')?.addEventListener('click', deactivateLicense);
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
  } else if (status === 'trial') {
    const daysLeft = Math.max(0, gate.daysLeft);
    const countdown = daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : 'less than 1 day left';
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
    licensePanelSub.textContent = 'Get lifetime access for a one-time $9 payment, then enter your license key below.';
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
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'RE_EVALUATE' } as ExtensionMessage).catch(() => { });
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

async function handleSignOut() {
  chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' } as ExtensionMessage, () => {
    authSession = null;
    showAuthWall();
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

  // Allowlist mode toggle
  allowlistToggle.checked = !!s.siteAllowlistMode;
  renderAllowlistUI(s);

  setControlsEnabled(s.enabled);
}

function renderAllowlistUI(s: ExtensionSettings) {
  const isAllowlist = !!s.siteAllowlistMode;

  if (isAllowlist) {
    allowlistSub.textContent = 'Only enabled sites';
    domainHint.textContent = domainToggle.checked
      ? 'ContentLens is ON for this site'
      : 'ContentLens is OFF for this site';
  } else {
    allowlistSub.textContent = 'Works on all sites';
    domainHint.textContent = domainToggle.checked
      ? 'ContentLens is ON for this site'
      : 'ContentLens is DISABLED for this site';
  }

  // Domain toggle state
  if (isAllowlist) {
    domainToggle.checked = s.domainRules[currentHost] === 'enabled';
  } else {
    domainToggle.checked = s.domainRules[currentHost] !== 'disabled';
  }

  // Show enabled sites list only in allowlist mode
  const enabledHosts = Object.entries(s.domainRules)
    .filter(([, rule]) => rule === 'enabled')
    .map(([host]) => host);

  if (isAllowlist && enabledHosts.length > 0) {
    enabledSitesList.classList.remove('hidden');
    enabledSitesUl.innerHTML = enabledHosts.map(host => `
      <li class="enabled-sites__item">
        <span class="enabled-sites__host">${host}</span>
        <button class="enabled-sites__remove" data-host="${host}" title="Remove">✕</button>
      </li>
    `).join('');
    enabledSitesUl.querySelectorAll<HTMLButtonElement>('.enabled-sites__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const host = btn.dataset.host!;
        const domainRules = { ...settings.domainRules };
        delete domainRules[host];
        persistSettings({ domainRules });
        renderAllowlistUI({ ...settings, domainRules });
      });
    });
  } else {
    enabledSitesList.classList.add('hidden');
  }
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

allowlistToggle.addEventListener('change', () => {
  const siteAllowlistMode = allowlistToggle.checked;
  // When switching to allowlist mode, add current site automatically so user isn't locked out
  const domainRules = { ...settings.domainRules };
  if (siteAllowlistMode && currentHost && domainRules[currentHost] !== 'enabled') {
    domainRules[currentHost] = 'enabled';
  }
  persistSettings({ siteAllowlistMode, domainRules });
  settings = { ...settings, siteAllowlistMode, domainRules };
  renderAllowlistUI(settings);
});

domainToggle.addEventListener('change', () => {
  if (!currentHost) return;
  const domainRules = { ...settings.domainRules };
  const isAllowlist = !!settings.siteAllowlistMode;

  if (isAllowlist) {
    // Opt-in mode
    if (domainToggle.checked) {
      domainRules[currentHost] = 'enabled';
    } else {
      delete domainRules[currentHost];
    }
  } else {
    // Default opt-out mode
    if (domainToggle.checked) {
      delete domainRules[currentHost];
    } else {
      domainRules[currentHost] = 'disabled';
    }
  }
  persistSettings({ domainRules });
  settings = { ...settings, domainRules };
  renderAllowlistUI(settings);
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
