/* md-viewer: typed settings shared by the viewer and the options page.
 * Settings live in chrome.storage.sync (they follow the Chrome profile);
 * if sync is unavailable or over quota we fall back to local. Legacy
 * settings written to local by older versions are migrated once. */

export type ThemeSetting = 'system' | 'light' | 'dark' | 'dimmed';

import prismThemes from './prism-themes.json';

/** One selectable Prism theme (options page picker; ids whitelist settings). */
export interface PrismThemeInfo {
  id: string;
  name: string;
  dark: boolean;
}

export const PRISM_THEMES: PrismThemeInfo[] = prismThemes;

export interface MdSettings {
  theme: ThemeSetting;
  width: string;
  toc: 'open' | 'closed';
  /** Outline sidebar width in px (drag the edge to resize; clamped 180–480). */
  tocWidth: number;
  /** Prism theme used when the resolved page theme is light. */
  prismLight: string;
  /** Prism theme used when the resolved page theme is dark (dark, dimmed). */
  prismDark: string;
  /** Body font-family override; '' keeps the CSS default stack. */
  font: string;
  /** Code font-family override; '' keeps the CSS default stack. */
  codeFont: string;
  /** Show line numbers on highlighted code blocks (Prism line-numbers plugin). */
  lineNumbers: boolean;
}

export const DEFAULTS: MdSettings = {
  theme: 'system',
  width: 'medium',
  toc: 'open',
  tocWidth: 280,
  prismLight: 'default',
  prismDark: 'dark',
  font: '',
  codeFont: '',
  lineNumbers: false,
};

const KEYS = Object.keys(DEFAULTS) as (keyof MdSettings)[];
const THEMES: ThemeSetting[] = ['system', 'light', 'dark', 'dimmed'];
const PRISM_IDS = new Set(PRISM_THEMES.map((t) => t.id));

/** Keys whose sync write failed (quota/sync off) live in this local blob and
 * win over sync until a sync write for that key succeeds again. */
const FALLBACK_KEY = 'mdSettingsFallback';
let overlay: Record<string, unknown> = {};
let migrationBlocked = false;

let cached: MdSettings = { ...DEFAULTS };
const listeners = new Set<(s: MdSettings) => void>();

/** Values from storage that pass type checks; anything else is a default. */
function sanitize(raw: Record<string, unknown>): MdSettings {
  const out: MdSettings = { ...DEFAULTS };
  if (THEMES.includes(raw.theme as ThemeSetting)) out.theme = raw.theme as ThemeSetting;
  if (typeof raw.width === 'string' && raw.width) out.width = raw.width;
  if (raw.toc === 'open' || raw.toc === 'closed') out.toc = raw.toc;
  if (typeof raw.tocWidth === 'number' && Number.isFinite(raw.tocWidth)) {
    out.tocWidth = Math.min(480, Math.max(180, raw.tocWidth));
  }
  if (typeof raw.prismLight === 'string' && PRISM_IDS.has(raw.prismLight)) out.prismLight = raw.prismLight;
  if (typeof raw.prismDark === 'string' && PRISM_IDS.has(raw.prismDark)) out.prismDark = raw.prismDark;
  if (typeof raw.font === 'string') out.font = raw.font;
  if (typeof raw.codeFont === 'string') out.codeFont = raw.codeFont;
  if (typeof raw.lineNumbers === 'boolean') out.lineNumbers = raw.lineNumbers;
  return out;
}

async function readOverlay(): Promise<Record<string, unknown>> {
  try {
    const v = await chrome.storage.local.get(FALLBACK_KEY);
    return (v[FALLBACK_KEY] as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

function persistOverlay() {
  try {
    void chrome.storage.local.set({ [FALLBACK_KEY]: overlay }).catch(() => {});
  } catch {
    /* storage unavailable */
  }
}

/** Merge order: sync < local overlay (failed sync writes) < legacy local
 * migration (only for keys nothing else provides). */
async function getStored(): Promise<Record<string, unknown>> {
  let stored: Record<string, unknown> = {};
  try {
    stored = await chrome.storage.sync.get(null);
  } catch {
    /* sync unavailable — local overlay/migration below still apply */
  }
  overlay = await readOverlay();
  Object.assign(stored, overlay);
  try {
    const localVals = await chrome.storage.local.get(null);
    const missing = KEYS.filter((k) => !(k in stored) && k in localVals);
    if (missing.length && !migrationBlocked) {
      const patch = Object.fromEntries(missing.map((k) => [k, localVals[k]]));
      try {
        await chrome.storage.sync.set(patch);
      } catch {
        /* sync over quota/off — stop retrying this session */
        migrationBlocked = true;
      }
      for (const k of missing) stored[k] = localVals[k];
    }
  } catch {
    /* local read failed — what we have is fine */
  }
  return stored;
}

/* Font-family values are injected as CSS custom properties on <html>; keep
 * them to safe single values. '' means "use the CSS default stack". */
const UNSAFE_IN_FONT = /[;{}<>`\\]/;

export function safeFontValue(value: string): string {
  const v = value.trim();
  return !v || UNSAFE_IN_FONT.test(v) ? '' : v;
}

export async function loadSettings(): Promise<MdSettings> {
  cached = sanitize(await getStored());
  return cached;
}

export async function saveSetting<K extends keyof MdSettings>(
  key: K,
  value: MdSettings[K]
): Promise<void> {
  cached = { ...cached, [key]: value };
  try {
    await chrome.storage.sync.set({ [key]: value });
    if (key in overlay) {
      delete overlay[key];
      persistOverlay();
    }
  } catch {
    // Sync write failed: remember the value locally so loadSettings keeps it
    // instead of resurrecting the stale sync value.
    overlay[key] = value;
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch {
      /* storage unavailable — setting lasts for this page only */
    }
    persistOverlay();
  }
}

function onStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) {
  if (areaName !== 'sync' && areaName !== 'local') return;
  if (!KEYS.some((k) => k in changes)) return;
  void loadSettings().then((s) => {
    for (const cb of listeners) cb(s);
  });
}

/** Registers cb for settings changes from any context (viewer, options). */
export function onSettingsChanged(cb: (s: MdSettings) => void): void {
  if (listeners.size === 0) {
    chrome.storage.onChanged.addListener(onStorageChanged);
  }
  listeners.add(cb);
}
