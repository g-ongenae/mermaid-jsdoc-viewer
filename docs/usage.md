# Usage

The extension activates in JavaScript and TypeScript files (`.js`, `.jsx`,
`.ts`, `.tsx`) and looks for ` ```mermaid ` fenced code blocks inside
`/** ... */` JSDoc comments:

```ts
/**
 * Processes an order.
 *
 * ```mermaid
 * flowchart TD
 *   A[Order received] --> B{In stock?}
 *   B -- yes --> C[Ship]
 *   B -- no --> D[Back-order]
 * ```
 */
export function processOrder(order) {}
```

## CodeLenses

Two CodeLenses appear above every detected diagram:

- **▶ Open in Mermaid Live** opens the diagram in the full mermaid.live editor
  in your browser.
- **Display** renders the diagram as SVG, through
  [mermaid.ink](https://mermaid.ink), in a panel beside the editor. Scroll to
  zoom, drag to pan, or use the +/−/⟳ toolbar. Double-click resets the view.

## Commands

Both actions are also available from the command palette and the editor's
right-click menu:

- **Mermaid JSDoc: Open in Mermaid Live**
- **Mermaid JSDoc: Display Diagram**

If the file has more than one diagram, you are asked to pick one.

## How a diagram reaches mermaid.live

1. The extension finds the ` ```mermaid ` fence inside the JSDoc comment and
   strips the leading ` * ` of each line.
2. It wraps the source in the state object mermaid.live expects and compresses
   it with [pako](https://github.com/nodeca/pako).
3. It opens `https://mermaid.live/edit#pako:<compressed-state>`. The
   **Display** panel loads the same fragment from `https://mermaid.ink/svg/`.

The diagram's text leaves your machine only when you click one of the two
actions.
