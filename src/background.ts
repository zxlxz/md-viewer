/* md-viewer: on request from the content script, injects the renderer stack
 * (styles + app bundle, which carries marked/Prism/pele) into the requesting
 * tab, and relays requests the content script cannot make itself (content
 * scripts don't get chrome.runtime.openOptionsPage). */
type Message =
  | { type: 'md-viewer:render' }
  | { type: 'md-viewer:options' };

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
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: [
          'katex/katex.min.css',
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
