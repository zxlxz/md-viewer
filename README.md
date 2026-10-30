# md-viewer

A Chrome extension (Manifest V3) that renders Markdown files in the browser instead of showing them as plain text.

Open a local `.md` file (`file:///…`) or a remote `.md` / `.markdown` URL and the page is replaced with a styled reading view. Relative image and link paths still resolve, because the original page URL is kept.

## Features

- **Markdown rendering** with GFM tables, task lists, and more, via [marked](https://github.com/markedjs/marked).
- **Math** with KaTeX: inline `$…$`, display `$$…$$`, and ```` ```math ```` fences.
- **Mermaid diagrams** through [pele](https://www.npmjs.com/package/pele) (Obsidian's renderer). Each diagram has an expand button that opens a full-screen viewer with wheel zoom, drag to pan, and zoom controls.
- **Syntax highlighting** with Prism, including C, C++, Python, JSON, and Markdown. Themes come from the official Prism set and the `prism-themes` collection.
- **Raw HTML fences**: a ```` ```html ```` fence is inserted verbatim into the page.
- **Outline sidebar**: a heading list with scroll-spy highlighting, a resizable width, and a toggle button.
- **Source view**: switch between the rendered article and the raw Markdown, highlighted.
- **Themes**: System, Light, Dark, and Dimmed (GitHub's Dark Dimmed). Light and dark pages each get a paired Prism theme.
- **Customization**: content width (1000–1600px or full), body and code fonts, including system fonts detected on request, and an optional line-number display for code blocks.
- **Options page** with live previews. Settings are saved immediately to `chrome.storage`.

## Install

Requires Node.js 22 or newer (the build imports JSON with `with { type: 'json' }`).

```bash
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. For local files, open the extension's details page and enable **Allow access to file URLs**.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Bundle `src/*.ts` into `dist/`, copy static assets, and generate the CSS files. |
| `npm run watch` | Same as build, rebuilding on change. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm run gen:prism` | Regenerate `dist/css/prism.css` only. Makes no network calls and fails loudly on error. |

There is no test suite or linter. Validate changes with `npm run typecheck` and `npm run build`, then load `dist/` and check the page by hand.

## How it works

The pipeline spans three parts:

1. **`src/detect.ts`** is a content script. It runs on local `.md` files, remote `.md`/`.markdown` URLs, and any page whose `document.contentType` starts with `text/`. It asks the background worker to take over.
2. **`src/background.ts`** is the service worker. It injects the KaTeX stylesheet with its font URLs rewritten to extension URLs, then the viewer CSS, then `app.js`.
3. **`src/app.ts`** reads the raw text from the page, parses it with marked, renders math and Mermaid fences, highlights code with Prism, and builds the UI.

`src/options.ts` and `src/options.html` provide the settings page. `src/settings.ts` holds the defaults, validation, and storage helpers shared by both.

## Project layout

```
build.mjs              esbuild bundling, CSS generation, asset copying
manifest.json          extension manifest (source of truth; copied to dist/)
src/
  detect.ts            content script: detects Markdown pages
  background.ts        service worker: injects CSS and the app bundle
  app.ts               the viewer: parse, render, outline, controls
  options.ts/.html     settings page
  settings.ts          settings defaults, validation, storage
  prism-themes.json    theme list (single source for Prism theme ids)
css/
  app.css              design tokens, layout, and UI chrome
  options.css          settings page styles
icons/                 PNG icons (manifest) and logo.svg (master design)
temp/                  scratch Markdown files for manual testing
dist/                  build output (generated; load this folder in Chrome)
```

Generated files in `dist/` are not committed:

- `dist/css/prism.css` is built from the installed `prismjs` and `prism-themes` packages.
- `dist/css/github-markdown.css` is built from `github-markdown-css`, with each variant scoped to `html[data-md-theme=…]`.
- `dist/katex/` holds the KaTeX stylesheet and fonts, copied from `node_modules/katex`.

## Permissions

- `scripting`: inject the viewer's CSS and script into Markdown pages.
- `storage`: save settings with `chrome.storage`.
- Host access to `file:///*`, `http://*/*`, and `https://*/*`.

Font detection uses the browser's Local Font Access API. Chrome asks the user for permission the first time it is used, so no manifest permission is needed.

## Icons

The manifest uses the PNG icons in `icons/`. Chrome does not accept SVG for manifest icons, so `icons/logo.svg` is kept as an editable master. To change the logo, edit the SVG and re-export the four PNG sizes.

## License

ISC (see `package.json`).
