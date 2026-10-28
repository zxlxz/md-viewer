/* md-viewer: detects plain-text markdown documents and asks the background
 * worker to take over the tab. Real HTML pages (e.g. GitHub blob views) are
 * left untouched. */
declare global {
  interface Window {
    __mdViewerRequested?: boolean;
  }
}

(() => {
  if (window.__mdViewerRequested) return;

  const path = location.pathname.toLowerCase();
  if (!path.endsWith('.md') && !path.endsWith('.markdown')) return;

  const type = (document.contentType || '').toLowerCase();
  if (type && !type.startsWith('text/')) return;

  window.__mdViewerRequested = true;
  chrome.runtime.sendMessage({ type: 'md-viewer:render' } as const);
})();

export {};
