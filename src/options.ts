/* md-viewer options page. Loads settings, renders the controls and re-applies
 * on every change — there is no save button. The page reuses the real
 * app.css/prism.css so the samples are pixel-true previews. */
import Prism from 'prismjs';
import 'prismjs/components/prism-c'; // extends clike (core)
import 'prismjs/components/prism-cpp'; // extends c
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/plugins/line-numbers/prism-line-numbers'; // complete-hook based; needs pre.line-numbers + its css (in generated prism.css)
import {
  BODY_FONTS,
  CODE_FONTS,
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

/* Local Font Access API (Chrome 103+). Needs no manifest permission; Chrome
 * prompts the user on the first call, so it runs only from the font select. */
interface LocalFontFace {
  family: string;
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontFace[]>;
  }
}

/** Select value that triggers a system-font scan instead of a selection. */
const DETECT = '__detect__';
/** Families found on this device — session-only (device-specific, too big
 * for sync storage). Null until the first scan. */
let detectedFonts: string[] | null = null;

/** Quoted family name as a CSS font-family stack (quoted so any name,
 * including ones with spaces or digits, is a valid family token). */
function familyStack(family: string): string {
  return '"' + family.replace(/["\\]/g, '') + '"';
}

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
  document.documentElement.style.setProperty('--md-font-size', settings.fontSize + 'px');
  applySampleLineNumbers();
  syncControls();
}

/* Fill the font selects: curated lists from settings.ts (single source of
 * truth), a "detect" entry that scans the device via queryLocalFonts, and —
 * once scanned — an optgroup with the families found on this device. */
function fillFontSelects() {
  const canDetect = typeof window.queryLocalFonts === 'function';
  for (const [sel, list] of [
    ['#body-font', BODY_FONTS],
    ['#code-font', CODE_FONTS],
  ] as const) {
    const select = document.querySelector<HTMLSelectElement>(sel);
    if (!select) continue;
    select.textContent = '';
    if (canDetect) {
      const opt = document.createElement('option');
      opt.value = DETECT;
      opt.textContent = 'Detect system fonts…';
      select.appendChild(opt);
    }
    for (const f of list) {
      const opt = document.createElement('option');
      opt.value = f.stack;
      opt.textContent = f.label;
      select.appendChild(opt);
    }
    if (detectedFonts) {
      const group = document.createElement('optgroup');
      group.label = 'On this device';
      for (const family of detectedFonts) {
        const opt = document.createElement('option');
        opt.value = familyStack(family);
        opt.textContent = family;
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
  }
}

/** queryLocalFonts returns one face per style; keep unique families. */
async function detectFonts() {
  if (!window.queryLocalFonts) return;
  try {
    const faces = await window.queryLocalFonts();
    const families = [...new Set(faces.map((f) => f.family))].sort((a, b) =>
      a.localeCompare(b)
    );
    if (families.length) detectedFonts = families;
  } catch {
    /* picker dismissed / permission denied — keep the curated lists */
  }
  fillFontSelects();
}

/* The sample carries the class before highlight time (init highlights it
 * after apply); toggling later re-highlights or strips the plugin's rows. */
function applySampleLineNumbers() {
  const pre = document.querySelector<HTMLElement>('.sample-body pre');
  const code = pre?.querySelector('code');
  if (!pre || !code) return;
  if (settings.lineNumbers) {
    pre.classList.add('line-numbers');
    if (!code.querySelector('.line-numbers-rows')) Prism.highlightElement(code);
  } else {
    pre.classList.remove('line-numbers');
    pre.querySelectorAll('.line-numbers-rows, .line-numbers-sizer').forEach((el) => el.remove());
  }
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

  const bodyFont = document.querySelector<HTMLSelectElement>('#body-font');
  const codeFont = document.querySelector<HTMLSelectElement>('#code-font');
  const fontSize = document.querySelector<HTMLSelectElement>('#font-size');
  if (bodyFont) bodyFont.value = settings.font;
  if (codeFont) codeFont.value = settings.codeFont;
  if (fontSize) fontSize.value = String(settings.fontSize);

  const lineNumbers = document.querySelector<HTMLInputElement>('#line-numbers');
  if (lineNumbers) lineNumbers.checked = settings.lineNumbers;
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

  document.querySelector<HTMLInputElement>('#line-numbers')?.addEventListener('change', (e) => {
    settings.lineNumbers = (e.target as HTMLInputElement).checked;
    apply();
    void saveSetting('lineNumbers', settings.lineNumbers);
  });

  // Select-only fonts save on change (no typing, no debounce needed); other-
  // origin changes arrive through onSettingsChanged.
  const wireFont = (id: string, key: 'font' | 'codeFont') => {
    document.querySelector<HTMLSelectElement>(id)?.addEventListener('change', (e) => {
      const select = e.target as HTMLSelectElement;
      if (select.value === DETECT) {
        void detectFonts().then(() => syncControls()); // re-sync restores the selection
        return;
      }
      settings[key] = select.value;
      apply();
      void saveSetting(key, settings[key]);
    });
  };
  wireFont('#body-font', 'font');
  wireFont('#code-font', 'codeFont');

  document.querySelector<HTMLSelectElement>('#font-size')?.addEventListener('change', (e) => {
    settings.fontSize = Number((e.target as HTMLSelectElement).value);
    apply();
    void saveSetting('fontSize', settings.fontSize);
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
  fillFontSelects();
  settings = await loadSettings();
  wire();
  apply();

  // Highlight the sample once; Prism theme switching is pure CSS from here.
  const sample = document.querySelector('.sample-body code');
  if (sample) Prism.highlightElement(sample);
}

void init();
