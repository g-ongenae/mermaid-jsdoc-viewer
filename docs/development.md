# Development

## Build and run

```bash
npm install
npm run compile   # or `npm run watch`
```

Press `F5` in VS Code to launch an Extension Development Host with the
extension loaded.

## Packaging and publishing

The extension is bundled into a single `dist/extension.js` with esbuild
(`npm run package`), so the published `.vsix` ships neither `node_modules` nor
development files:

```bash
npx @vscode/vsce package   # produces mermaid-jsdoc-viewer-<version>.vsix
npx @vscode/vsce publish   # requires `vsce login <publisher>` first
```

Attach the `.vsix` to a
[GitHub release](https://github.com/g-ongenae/mermaid-jsdoc-viewer/releases)
so it can be installed with `code --install-extension`.
