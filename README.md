# Mermaid JSDoc Viewer

Opens Mermaid diagrams found inside JSDoc comments directly in the
[Mermaid Live](https://mermaid.live) editor.

## What it does

1. Detects ` ```mermaid ` fenced code blocks inside `/** ... */` JSDoc comments.
2. Serializes the mermaid source into the state object mermaid.live expects,
   and compresses it with [pako](https://github.com/nodeca/pako).
3. Opens `https://mermaid.live/edit#pako:<compressed-state>` in your browser.

## Usage

- A "▶ Open in Mermaid Live" CodeLens appears above every detected diagram
  in JS/TS files — click it to open that diagram in the full mermaid.live
  editor.
- A "Display" CodeLens next to it renders the diagram (as SVG, via
  [mermaid.ink](https://mermaid.ink)) in a panel beside the editor. Scroll to
  zoom, drag to pan, or use the +/−/⟳ toolbar; double-click resets the view.
- Both are also available as commands (**Mermaid JSDoc: Open in Mermaid
  Live** / **Mermaid JSDoc: Display Diagram**) from the command palette or
  the editor's right-click menu. If the file has more than one diagram,
  you'll be prompted to pick which one.

## Development

```bash
npm install
npm run compile   # or `npm run watch`
```

Press `F5` in VS Code to launch an Extension Development Host with the
extension loaded.
