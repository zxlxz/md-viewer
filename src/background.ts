/* md-viewer: on request from the content script, injects the renderer stack
 * (styles + app bundle, which carries marked/Prism/pele) into the requesting
 * tab, and relays requests the content script cannot make itself (content
 * scripts don't get chrome.runtime.openOptionsPage). */
type Message =
  | { type: 'md-viewer:render' }
  | { type: 'md-viewer:options' };

async function insertKatexStylesheet(tabId: number) {
  const response = await fetch(chrome.runtime.getURL('katex/katex.min.css'));
  if (!response.ok) {
    throw new Error(
      `Failed to load KaTeX stylesheet: ${response.status} ${response.statusText}`
    );
  }
  const fontBase = chrome.runtime.getURL('katex/fonts/');
  const css = (await response.text()).replace(
    /url\((['"]?)fonts\//g,
    (_match, quote: string) => `url(${quote}${fontBase}`
  );
  await chrome.scripting.insertCSS({
    target: { tabId },
    css,
  });
}

chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
  const type = (msg as Partial<Message> | undefined)?.type;

  if (type === 'md-viewer:options') {
    void chrome.runtime.openOptionsPage().catch((err) => {
      console.error('md-viewer:', err);
    });
    return;
  }

  if (type !== 'md-viewer:render' || !sender.tab?.id) return;

  const tabId = sender.tab.id;
  (async () => {
    try {
      await insertKatexStylesheet(tabId);
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: [
          'css/github-markdown.css',
          'css/app.css',
          'css/prism.css',
        ],
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['app.js'],
      });
    } catch (err) {
      console.error('md-viewer:', err);
    }
  })();
});
