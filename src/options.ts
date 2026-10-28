/* md-viewer options page. Loads settings, renders the controls and re-applies
 * on every change — there is no save button. The page reuses the real
 * app.css/prism.css so the samples are pixel-true previews. */
import Prism from 'prismjs';
import 'prismjs/components/prism-c'; // extends clike (core)
import 'prismjs/components/prism-cpp'; // extends c
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import {
  DEFAULTS,
  loadSettings,
  onSettingsChanged,
  PRISM_THEMES,
  saveSetting,
  safeFontValue,
  type MdSettings,
  type ThemeSetting,
} from './settings';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let settings: MdSettings = { ...DEFAULTS };

function resolvedDark(): boolean {
  if (settings.theme === 'dark' || settings.theme === 'dimmed') return true;
  return settings.theme === 'system' && darkQuery.matches;
}

function apply() {
  document.documentElement.dataset.mdTheme = settings.theme;
  document.documentElement.dataset.mdPrism = resolvedDark()
    ? settings.prismDark
    : settings.prismLight;
  // '' must remove the property so the var() fallback stack applies.
  const setOrClear = (name: string, value: string) => {
    const v = safeFontValue(value);
    if (v) document.documentElement.style.setProperty(name, v);
    else document.documentElement.style.removeProperty(name);
  };
  setOrClear('--md-font', settings.font);
  setOrClear('--md-code-font', settings.codeFont);
  syncControls();
}

/* ----- controls ----- */

function syncControls() {
  document.querySelectorAll<HTMLButtonElement>('#theme-cards .theme-card').forEach((btn) => {
    btn.setAttribute('aria-checked', String(settings.theme === btn.dataset.value));
  });
  document.querySelectorAll<HTMLButtonElement>('#width-group .width-stop').forEach((btn) => {
    btn.setAttribute('aria-checked', String(settings.width === btn.dataset.value));
  });

  const light = document.querySelector<HTMLSelectElement>('#prism-light');
  const dark = document.querySelector<HTMLSelectElement>('#prism-dark');
  if (light) light.value = settings.prismLight;
  if (dark) dark.value = settings.prismDark;

  // Don't clobber a field the user is typing in.
  const bodyFont = document.querySelector<HTMLInputElement>('#body-font');
  const codeFont = document.querySelector<HTMLInputElement>('#code-font');
  if (bodyFont && document.activeElement !== bodyFont) bodyFont.value = settings.font;
  if (codeFont && document.activeElement !== codeFont) codeFont.value = settings.codeFont;
}

function fillPrismSelects() {
  for (const [sel, darkSide] of [
    ['#prism-light', false],
    ['#prism-dark', true],
  ] as const) {
    const select = document.querySelector<HTMLSelectElement>(sel);
    if (!select) continue;
    select.textContent = '';
    for (const t of PRISM_THEMES) {
      if (t.dark !== darkSide) continue;
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    }
  }
}

/* ----- wiring ----- */

function wire() {
  document.querySelectorAll<HTMLButtonElement>('#theme-cards .theme-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.theme = (btn.dataset.value || 'system') as ThemeSetting;
      apply();
      void saveSetting('theme', settings.theme);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('#width-group .width-stop').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.width = btn.dataset.value || 'medium';
      apply();
      void saveSetting('width', settings.width);
    });
  });

  document.querySelector<HTMLSelectElement>('#prism-light')?.addEventListener('change', (e) => {
    settings.prismLight = (e.target as HTMLSelectElement).value;
    apply();
    void saveSetting('prismLight', settings.prismLight);
  });
  document.querySelector<HTMLSelectElement>('#prism-dark')?.addEventListener('change', (e) => {
    settings.prismDark = (e.target as HTMLSelectElement).value;
    apply();
    void saveSetting('prismDark', settings.prismDark);
  });

  // Font typing saves debounced per field (a shared timer could drop one
  // field's save when the other is typed right after); other-origin changes
  // arrive through onSettingsChanged.
  const fontTimers: Partial<Record<'font' | 'codeFont', ReturnType<typeof setTimeout>>> = {};
  const flushFont = (key: 'font' | 'codeFont') => {
    const timer = fontTimers[key];
    if (timer === undefined) return;
    clearTimeout(timer);
    delete fontTimers[key];
    void saveSetting(key, safeFontValue(settings[key]) as never);
  };
  const wireFont = (id: string, key: 'font' | 'codeFont') => {
    document.querySelector<HTMLInputElement>(id)?.addEventListener('input', (e) => {
      settings[key] = (e.target as HTMLInputElement).value;
      apply();
      clearTimeout(fontTimers[key]);
      fontTimers[key] = setTimeout(() => flushFont(key), 300);
    });
  };
  wireFont('#body-font', 'font');
  wireFont('#code-font', 'codeFont');
  // Closing the tab within the debounce window must not lose the edit.
  window.addEventListener('pagehide', () => {
    flushFont('font');
    flushFont('codeFont');
  });

  onSettingsChanged((s) => {
    settings = s;
    apply();
  });
  darkQuery.addEventListener('change', apply);
}

/* ----- init ----- */

async function init() {
  fillPrismSelects();
  settings = await loadSettings();
  wire();
  apply();

  // Highlight the sample once; Prism theme switching is pure CSS from here.
  const sample = document.querySelector('.sample-body code');
  if (sample) Prism.highlightElement(sample);
}

void init();
