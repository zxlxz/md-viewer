/* md-viewer: replaces the plain-text markdown document in this tab with a
 * rendered reading view. Runs in the content-script world; marked, Prism and
 * pele are bundled into this file. */
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import katex from 'katex';
import Prism from 'prismjs';
import { render as peleRender } from 'pele';
import {
  DEFAULTS,
  loadSettings,
  onSettingsChanged,
  safeFontValue,
  saveSetting,
  type MdSettings,
} from './settings';

/* Prism language components, in dependency order (prismjs core always
 * includes markup/css/clike/javascript and sets globalThis.Prism when
 * bundled, which these side-effect imports rely on). Add a language by
 * adding one line here, after the languages it extends. */
import 'prismjs/components/prism-markdown'; // source view (extends markup, core)
import 'prismjs/components/prism-c'; // extends clike (core)
import 'prismjs/components/prism-cpp'; // extends c
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';

declare global {
  interface Window {
    __mdViewerRendered?: boolean;
  }
}

// $…$ inline and $$…$$ display math render to KaTeX HTML during parsing.
marked.use(markedKatex({ nonStandard: true, throwOnError: false }));

(() => {
  if (window.__mdViewerRendered) return;
  window.__mdViewerRendered = true;

  // Grab the raw text before wiping the document.
  const raw = document.body.innerText;

  const filename =
    decodeURIComponent(location.pathname.split('/').pop() || 'document')
      .replace(/\.(md|markdown)$/i, '');

  // Take over the plain-text page.
  document.documentElement.innerHTML = '<head></head><body></body>';

  const meta = document.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  document.head.appendChild(meta);
  document.title = filename;

  const app = document.createElement('div');
  app.id = 'md-viewer';
  document.body.appendChild(app);

  const article = document.createElement('article');
  article.className = 'markdown-body';
  app.appendChild(article);

  /* ---------- settings: theme + content width + toc ---------- */

  const WIDTHS: Record<string, string> = {
    narrow: '1000px',
    medium: '1200px',
    wide: '1400px',
    xlarge: '1600px',
    full: 'none',
  };
  const WIDTH_LABELS: Record<string, string> = {
    narrow: '1000',
    medium: '1200',
    wide: '1400',
    xlarge: '1600',
    full: 'Full',
  };
  let settings: MdSettings = { ...DEFAULTS };

  let tocPanel: HTMLElement | null = null;
  let tocBtn: HTMLButtonElement | null = null;
  let themeBtn: HTMLButtonElement | null = null;
  let srcBtn: HTMLButtonElement | null = null;
  let topBtn: HTMLButtonElement | null = null;

  let sourceMode = false;
  let sourceHighlighted = false;

  /* Resolved page side (light/dark): the theme setting, or the OS preference
   * when following the system. Drives which paired Prism theme applies. */
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function resolvedDark(): boolean {
    if (settings.theme === 'dark' || settings.theme === 'dimmed') return true;
    return settings.theme === 'system' && darkQuery.matches;
  }
  function resolvedPrism(): string {
    return resolvedDark() ? settings.prismDark : settings.prismLight;
  }
  /* The corner button is a light/dark flip: it lands on the explicit theme
   * opposite the currently effective side (system/dimmed resolve first). */
  function toggleTheme() {
    setSetting('theme', resolvedDark() ? 'light' : 'dark');
  }

  /* Font values come from the options page; safeFontValue trims and vetoes
   * unsafe strings ('' → remove the property so the CSS fallback applies). */
  function applyFontVar(name: '--md-font' | '--md-code-font', value: string) {
    const v = safeFontValue(value);
    if (v) {
      document.documentElement.style.setProperty(name, v);
    } else {
      document.documentElement.style.removeProperty(name);
    }
  }

  function applySettings() {
    document.documentElement.setAttribute('data-md-theme', settings.theme);
    document.documentElement.setAttribute('data-md-prism', resolvedPrism());
    // On the container so the article AND the source view resolve the var.
    app.style.setProperty('--md-max-width', WIDTHS[settings.width] || WIDTHS.medium);
    applyFontVar('--md-font', settings.font);
    applyFontVar('--md-code-font', settings.codeFont);
    // Outline sidebar width (user-resizable). Set on <html> — the :has()
    // margin rule on #md-viewer must also resolve it.
    document.documentElement.style.setProperty(
      '--md-toc-width',
      String(settings.tocWidth) + 'px'
    );
    document
      .querySelectorAll<HTMLElement>('#md-viewer-panel [data-setting]')
      .forEach((btn) => {
        btn.setAttribute(
          'aria-pressed',
          String(settings[btn.dataset.setting as 'theme' | 'width' | 'toc'] === btn.dataset.value)
        );
      });
    const tocOpen = settings.toc !== 'closed';
    if (tocPanel) {
      tocPanel.classList.toggle('open', tocOpen);
      tocPanel.setAttribute('aria-hidden', String(!tocOpen));
    }
    if (tocBtn) {
      tocBtn.setAttribute('aria-expanded', String(tocOpen));
      // The open panel replaces its own toggle.
      tocBtn.hidden = tocOpen;
    }
    if (themeBtn) {
      themeBtn.innerHTML = resolvedDark() ? SUN_ICON : MOON_ICON;
      themeBtn.title = resolvedDark() ? 'Switch to light theme' : 'Switch to dark theme';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    highlightTocEntry();
  }

  function setSetting(key: 'theme' | 'width' | 'toc', value: string) {
    (settings as unknown as Record<string, string>)[key] = value;
    applySettings();
    void saveSetting(key, value as never);
  }

  async function initSettings() {
    settings = await loadSettings();
    onSettingsChanged((s) => {
      settings = s;
      applySettings();
    });
    // OS light/dark flips must re-pair the Prism theme when following system.
    darkQuery.addEventListener('change', () => {
      document.documentElement.setAttribute('data-md-prism', resolvedPrism());
    });
    applySettings();
  }

  /* ---------- icons (GitHub octicons, 16px, currentColor) ---------- */

  const LIST_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M5 3.25a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 3.25Zm0 4.75A.75.75 0 0 1 5.75 7.25h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75ZM1 3.25a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm0 4.75a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm0 4.75a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z"/>' +
    '</svg>';
  const SUN_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm5.657-8.485a.75.75 0 0 1 0 1.06l-1.061 1.06a.749.749 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.749.749 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.061Zm9.193 9.193a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 1 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM16 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Z"/>' +
    '</svg>';
  const MOON_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z"/>' +
    '</svg>';
  const CODE_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8 10.22 4.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/>' +
    '</svg>';
  const BOOK_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"/>' +
    '</svg>';
  const ARROW_UP_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M3.47 7.78a.75.75 0 0 1 0-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8.75 4.81v7.44a.75.75 0 0 1-1.5 0V4.81L4.53 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Z"/>' +
    '</svg>';
  const X_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>' +
    '</svg>';
  const GEAR_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.019-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032.499.119 1.05.53 1.456l.815.806c.081.08.073.159.059.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/>' +
    '</svg>';

  /* ---------- raw markdown source view ---------- */

  // Built next to the article; hidden until the topbar </> button flips it in.
  const sourceView = document.createElement('div');
  sourceView.id = 'md-viewer-source';
  sourceView.hidden = true;
  const sourceName = document.createElement('div');
  sourceName.className = 'md-source-name';
  sourceName.textContent = filename + '.md';
  const sourceCode = document.createElement('code');
  sourceCode.className = 'language-markdown';
  sourceCode.textContent = raw;
  const sourcePre = document.createElement('pre');
  sourcePre.appendChild(sourceCode);
  sourceView.append(sourceName, sourcePre);
  app.appendChild(sourceView);

  function setSourceMode(on: boolean) {
    if (sourceMode === on) return;
    sourceMode = on;
    article.hidden = on;
    sourceView.hidden = !on;
    if (srcBtn) {
      srcBtn.innerHTML = on ? BOOK_ICON : CODE_ICON;
      srcBtn.title = on ? 'Back to rendered view' : 'View Markdown source';
      srcBtn.setAttribute('aria-label', srcBtn.title);
      srcBtn.setAttribute('aria-pressed', String(on));
    }
    if (on && !sourceHighlighted) {
      // Highlight once, lazily, on first reveal.
      Prism.highlightAllUnder(sourceView);
      sourceHighlighted = true;
    }
  }

  /* ---------- controls: topbar + toc drawer + bottom-right ---------- */

  function buildControls() {
    /* top-left corner: outline toggle (hidden while the outline is open) */
    const topleft = document.createElement('div');
    topleft.id = 'md-viewer-topleft';

    tocBtn = document.createElement('button');
    tocBtn.id = 'md-viewer-toc-btn';
    tocBtn.type = 'button';
    tocBtn.title = 'Outline';
    tocBtn.setAttribute('aria-label', 'Outline');
    tocBtn.setAttribute('aria-expanded', 'false');
    tocBtn.innerHTML = LIST_ICON;
    tocBtn.addEventListener('click', () =>
      setSetting('toc', settings.toc === 'closed' ? 'open' : 'closed')
    );
    topleft.appendChild(tocBtn);
    document.body.appendChild(topleft);

    /* top-right corner: theme flip + source/render toggle */
    const topbar = document.createElement('div');
    topbar.id = 'md-viewer-topbar';

    themeBtn = document.createElement('button');
    themeBtn.id = 'md-viewer-theme-btn';
    themeBtn.type = 'button';
    themeBtn.addEventListener('click', toggleTheme);
    topbar.appendChild(themeBtn);

    srcBtn = document.createElement('button');
    srcBtn.id = 'md-viewer-src-btn';
    srcBtn.type = 'button';
    srcBtn.title = 'View Markdown source';
    srcBtn.setAttribute('aria-label', srcBtn.title);
    srcBtn.setAttribute('aria-pressed', 'false');
    srcBtn.innerHTML = CODE_ICON;
    srcBtn.addEventListener('click', () => setSourceMode(!sourceMode));
    topbar.appendChild(srcBtn);

    document.body.appendChild(topbar);

    /* outline: docked left column, resizable by dragging its edge */
    tocPanel = document.createElement('aside');
    tocPanel.id = 'md-viewer-toc';
    tocPanel.setAttribute('aria-label', 'Outline');
    tocPanel.setAttribute('aria-hidden', 'true');
    const tocHeader = document.createElement('div');
    tocHeader.className = 'md-toc-header';
    const tocTitle = document.createElement('span');
    tocTitle.textContent = 'Outline';
    const tocClose = document.createElement('button');
    tocClose.type = 'button';
    tocClose.className = 'md-toc-close';
    tocClose.title = 'Close';
    tocClose.setAttribute('aria-label', 'Close outline');
    tocClose.innerHTML = X_ICON;
    tocClose.addEventListener('click', () => setSetting('toc', 'closed'));
    tocHeader.append(tocTitle, tocClose);
    const tocScroll = document.createElement('div');
    tocScroll.className = 'md-toc-scroll';
    const tocResize = document.createElement('div');
    tocResize.className = 'md-toc-resize';
    tocResize.setAttribute('role', 'separator');
    tocResize.setAttribute('aria-orientation', 'vertical');
    tocResize.title = 'Drag to resize · double-click to reset';
    let resizeStart: { x: number; w: number } | null = null;
    tocResize.addEventListener('pointerdown', (e) => {
      resizeStart = { x: e.clientX, w: settings.tocWidth };
      document.body.classList.add('md-toc-resizing');
      tocResize.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    tocResize.addEventListener('pointermove', (e) => {
      if (!resizeStart) return;
      const w = Math.round(
        Math.min(480, Math.max(180, resizeStart.w + e.clientX - resizeStart.x))
      );
      settings.tocWidth = w;
      document.documentElement.style.setProperty('--md-toc-width', w + 'px');
    });
    const endResize = (e: PointerEvent) => {
      if (!resizeStart) return;
      resizeStart = null;
      document.body.classList.remove('md-toc-resizing');
      tocResize.releasePointerCapture(e.pointerId);
      void saveSetting('tocWidth', settings.tocWidth);
      e.stopPropagation();
    };
    tocResize.addEventListener('pointerup', endResize);
    tocResize.addEventListener('pointercancel', endResize);
    tocResize.addEventListener('dblclick', () => {
      settings.tocWidth = 280;
      applySettings();
      void saveSetting('tocWidth', settings.tocWidth);
    });
    tocPanel.append(tocHeader, tocScroll, tocResize);
    document.body.appendChild(tocPanel);

    /* bottom-right column: goto-top above the settings gear */
    const wrap = document.createElement('div');
    wrap.id = 'md-viewer-controls';

    topBtn = document.createElement('button');
    topBtn.id = 'md-viewer-top-btn';
    topBtn.type = 'button';
    topBtn.title = 'Back to top';
    topBtn.setAttribute('aria-label', 'Back to top');
    topBtn.innerHTML = ARROW_UP_ICON;
    topBtn.hidden = true;
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'md-viewer-panel';
    settingsPanel.hidden = true;

    const gear = document.createElement('button');
    gear.id = 'md-viewer-gear';
    gear.type = 'button';
    gear.title = 'Viewer settings';
    gear.setAttribute('aria-label', 'Viewer settings');
    gear.innerHTML = GEAR_ICON;

    const mkGroup = (label: string, key: 'theme' | 'width' | 'toc', values: string[]) => {
      const group = document.createElement('div');
      group.className = 'md-setting-group';
      const title = document.createElement('div');
      title.className = 'md-setting-label';
      title.textContent = label;
      const row = document.createElement('div');
      row.className = 'md-segmented';
      for (const value of values) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.setting = key;
        btn.dataset.value = value;
        btn.textContent = WIDTH_LABELS[value] || value[0].toUpperCase() + value.slice(1);
        btn.addEventListener('click', () => setSetting(key, value));
        row.appendChild(btn);
      }
      group.append(title, row);
      return group;
    };

    settingsPanel.append(
      mkGroup('Theme', 'theme', ['system', 'light', 'dark', 'dimmed']),
      mkGroup('Width', 'width', ['narrow', 'medium', 'wide', 'xlarge', 'full'])
    );

    /* jump to the full options page — openOptionsPage is background-only,
     * so this is relayed through the service worker */
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'md-more-settings';
    more.textContent = 'Open full settings…';
    more.addEventListener('click', () => {
      chrome.runtime
        .sendMessage({ type: 'md-viewer:options' })
        .catch(() => {
          /* background unreachable — options page still reachable via the
           * extension's details page */
        });
    });
    settingsPanel.append(more);

    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsPanel.hidden = !settingsPanel.hidden;
    });
    document.addEventListener('click', (e) => {
      if (
        !settingsPanel.hidden &&
        !settingsPanel.contains(e.target as Node | null) &&
        e.target !== gear
      ) {
        settingsPanel.hidden = true;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      settingsPanel.hidden = true;
      if (settings.toc !== 'closed') setSetting('toc', 'closed');
    });

    wrap.append(settingsPanel, topBtn, gear);
    document.body.appendChild(wrap);

    window.addEventListener('scroll', onScroll, { passive: true });
    updateTopBtn();
  }

  /* Fill the outline from the rendered headings (ids exist by now). */
  function buildToc() {
    if (!tocPanel || !tocBtn) return;
    const headings = article.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (!headings.length) {
      tocPanel.remove();
      tocPanel = null;
      tocBtn.hidden = true;
      return;
    }

    /* GitHub's outline: one indented row per heading, no collapse controls */
    const list = document.createElement('div');
    list.className = 'md-toc-list';
    for (const h of headings) {
      const level = Number(h.tagName[1]);
      const item = document.createElement('a');
      item.className = 'md-toc-item' + (level === 1 ? ' md-toc-top' : '');
      item.href = '#' + h.id; // raw id — CSS.escape is for selectors, not URLs
      item.dataset.target = h.id;
      item.style.paddingLeft = 10 + (level - 1) * 14 + 'px';
      item.textContent = h.textContent;
      item.addEventListener('click', () => {
        // Jumping from the source view lands on the rendered article.
        if (sourceMode) setSourceMode(false);
        // On narrow viewports the panel overlays the article — close it so
        // the destination is visible.
        if (window.matchMedia('(max-width: 900px)').matches) {
          setSetting('toc', 'closed');
        }
      });
      list.appendChild(item);
    }
    tocPanel.querySelector('.md-toc-scroll')!.appendChild(list);

    highlightTocEntry();
  }

  /* Scroll spy: mark the last heading above the viewport top as active. */
  function highlightTocEntry() {
    if (!tocPanel || !tocPanel.classList.contains('open') || sourceMode) return;
    let current: HTMLElement | null = null;
    for (const item of tocPanel.querySelectorAll<HTMLElement>('.md-toc-item')) {
      item.classList.remove('active');
      const el = document.getElementById(item.dataset.target || '');
      if (el && el.getBoundingClientRect().top <= 90) current = item;
    }
    if (current) {
      current.classList.add('active');
      const r = current.getBoundingClientRect();
      const p = tocPanel.getBoundingClientRect();
      if (r.top < p.top || r.bottom > p.bottom) {
        current.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  /* Goto-top button appears once the page has scrolled a bit. */
  function updateTopBtn() {
    if (topBtn) topBtn.hidden = window.scrollY <= 400;
  }

  let scrollTick = false;
  function onScroll() {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      highlightTocEntry();
      updateTopBtn();
    });
  }

  initSettings();
  buildControls();

  /* ---------- render markdown ---------- */

  let html: string;
  try {
    // async: false picks marked's sync overload so the string return is
    // type-enforced instead of cast away.
    html = marked.parse(raw, { gfm: true, breaks: false, async: false });
  } catch (err) {
    const fail = document.createElement('pre');
    fail.className = 'md-error';
    fail.textContent = 'md-viewer: failed to parse markdown.\n' + err;
    app.appendChild(fail);
    return;
  }

  article.innerHTML = html;

  // The extension renders trusted files, but never execute page scripts
  // that came along inside the markdown.
  article
    .querySelectorAll('script, iframe, object, embed, link, meta')
    .forEach((el) => el.remove());

  // GitHub-style heading slugs so #anchor links and location.hash work.
  // Unicode-aware: keeps CJK and other non-ASCII letters in the id.
  const seen = new Map<string, number>();
  article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    let slug = h.textContent
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]+/gu, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) slug = 'section';
    const n = (seen.get(slug) || 0) + 1;
    seen.set(slug, n);
    if (n > 1) slug += '-' + n;
    h.id = slug;
  });

  buildToc();

  (async () => {
    // math fences -> KaTeX display math (before highlighting).
    for (const code of article.querySelectorAll('code.language-math')) {
      const src = code.textContent || '';
      const holder = code.closest('pre') || code;
      const figure = document.createElement('div');
      figure.className = 'math-block';
      holder.replaceWith(figure);
      try {
        figure.innerHTML = katex.renderToString(src, {
          displayMode: true,
          throwOnError: false,
        });
      } catch (err) {
        figure.classList.add('math-error');
        figure.textContent =
          'Math render failed: ' + (err instanceof Error ? err.message : err);
      }
    }

    // Mermaid fences -> pele diagrams (before highlighting).
    for (const code of article.querySelectorAll('code.language-mermaid')) {
      const src = code.textContent || '';
      const holder = code.closest('pre') || code;
      const figure = document.createElement('figure');
      figure.className = 'mermaid-block';
      holder.replaceWith(figure);
      try {
        const result = peleRender(src);
        figure.innerHTML = result.svg;
      } catch (err) {
        figure.classList.add('mermaid-error');
        figure.textContent =
          'Mermaid render failed: ' + (err instanceof Error ? err.message : err);
      }
    }

    Prism.highlightAllUnder(article);

    if (location.hash) {
      try {
        const target = article.querySelector(
          '#' + CSS.escape(decodeURIComponent(location.hash.slice(1)))
        );
        if (target) target.scrollIntoView();
      } catch {
        /* malformed selector in the hash — ignore */
      }
    }
  })();
})();
