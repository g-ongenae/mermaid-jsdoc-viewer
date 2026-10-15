import * as vscode from 'vscode';
import * as pako from 'pako';

interface MermaidBlock {
  startLine: number;
  endLine: number;
  code: string;
}

/**
 * Strips a leading JSDoc line-continuation marker (optional whitespace + "*" + one space)
 * from a line taken from inside a `/** ... *\/` comment.
 */
function stripJsDocPrefix(line: string): string {
  return line.replace(/^\s*\*\s?/, '');
}

/**
 * Scans a document for `/** ... *\/` JSDoc comments and returns every
 * ```mermaid fenced code block found inside them, with line ranges in the
 * original document.
 */
function findMermaidBlocks(document: vscode.TextDocument): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];

  let inJsDoc = false;
  let inMermaid = false;
  let mermaidStartLine = -1;
  let mermaidLines: string[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const rawLine = document.lineAt(i).text;
    const trimmed = rawLine.trim();

    if (!inJsDoc) {
      if (trimmed.startsWith('/**')) {
        inJsDoc = true;
      }
      continue;
    }

    // Inside a JSDoc comment.
    if (trimmed.endsWith('*/') && !inMermaid) {
      inJsDoc = false;
      continue;
    }

    const content = stripJsDocPrefix(rawLine).trimEnd();

    if (!inMermaid) {
      if (content.trim().startsWith('```mermaid')) {
        inMermaid = true;
        mermaidStartLine = i;
        mermaidLines = [];
      }
    } else {
      if (content.trim() === '```') {
        blocks.push({
          startLine: mermaidStartLine,
          endLine: i,
          code: mermaidLines.join('\n'),
        });
        inMermaid = false;
      } else {
        mermaidLines.push(content);
      }
    }
  }

  return blocks;
}

/**
 * Scans a Markdown document for ```mermaid (or ~~~mermaid) fenced code blocks.
 * Other fences are tracked too, so a mermaid fence shown as an example inside
 * another code block is not mistaken for a diagram.
 */
function findMarkdownMermaidBlocks(document: vscode.TextDocument): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];

  let fence: { char: string; length: number; indent: number; isMermaid: boolean } | undefined;
  let startLine = -1;
  let lines: string[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const rawLine = document.lineAt(i).text;

    if (!fence) {
      const open = /^( {0,3})(`{3,}|~{3,})\s*([^`]*)$/.exec(rawLine);
      if (open) {
        fence = {
          char: open[2][0],
          length: open[2].length,
          indent: open[1].length,
          isMermaid: open[3].trim().split(/\s+/)[0] === 'mermaid',
        };
        startLine = i;
        lines = [];
      }
      continue;
    }

    const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(rawLine);
    if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
      if (fence.isMermaid) {
        blocks.push({ startLine, endLine: i, code: lines.join('\n') });
      }
      fence = undefined;
      continue;
    }

    // Content lines lose up to the opening fence's indentation, as in CommonMark.
    lines.push(rawLine.replace(new RegExp(`^ {0,${fence.indent}}`), '').trimEnd());
  }

  return blocks;
}

function findBlocks(document: vscode.TextDocument): MermaidBlock[] {
  return document.languageId === 'markdown'
    ? findMarkdownMermaidBlocks(document)
    : findMermaidBlocks(document);
}

/**
 * Compresses mermaid source into the `pako:` state encoding shared by
 * https://mermaid.live and https://mermaid.ink.
 */
function encodeMermaidState(code: string): string {
  const state = {
    code,
    mermaid: { theme: 'default' },
    autoSync: true,
    updateDiagram: true,
  };
  const deflated = pako.deflate(JSON.stringify(state), { level: 9 });
  return Buffer.from(deflated).toString('base64url');
}

function buildMermaidLiveUrl(code: string): string {
  return `https://mermaid.live/edit#pako:${encodeMermaidState(code)}`;
}

function buildMermaidInkUrl(code: string): string {
  return `https://mermaid.ink/svg/pako:${encodeMermaidState(code)}`;
}

async function openInMermaidLive(code: string): Promise<void> {
  const url = buildMermaidLiveUrl(code);
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

let displayPanel: vscode.WebviewPanel | undefined;

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function displayDiagram(code: string): void {
  const imageUrl = buildMermaidInkUrl(code);
  const nonce = getNonce();

  if (displayPanel) {
    displayPanel.reveal(vscode.ViewColumn.Beside, true);
  } else {
    displayPanel = vscode.window.createWebviewPanel(
      'mermaidJsdocViewer.display',
      'Mermaid Diagram',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true }
    );
    displayPanel.onDidDispose(() => {
      displayPanel = undefined;
    });
  }

  displayPanel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://mermaid.ink; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { height: 100%; margin: 0; background: var(--vscode-editor-background); overflow: hidden; }
  #toolbar {
    position: fixed; top: 8px; right: 8px; z-index: 1;
    display: flex; gap: 4px;
  }
  #toolbar button {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
    border: none; border-radius: 4px; width: 28px; height: 28px;
    font-size: 16px; cursor: pointer;
  }
  #toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  #viewport {
    position: relative;
    width: 100%; height: 100%;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    cursor: grab;
  }
  #viewport.dragging { cursor: grabbing; }
  #diagram {
    max-width: 90%; max-height: 90%;
    user-select: none;
    -webkit-user-drag: none;
  }
  #diagram.zooming {
    position: absolute; top: 0; left: 0;
    max-width: none; max-height: none;
    transform-origin: 0 0;
  }
</style>
</head>
<body>
  <div id="toolbar">
    <button id="zoom-out" title="Zoom out">−</button>
    <button id="zoom-reset" title="Reset zoom">⟳</button>
    <button id="zoom-in" title="Zoom in">+</button>
  </div>
  <div id="viewport">
    <img id="diagram" src="${imageUrl}" alt="Mermaid diagram" />
  </div>
  <script nonce="${nonce}">
    const viewport = document.getElementById('viewport');
    const diagram = document.getElementById('diagram');

    let scale = 1, x = 0, y = 0;
    let zoomActive = false;
    let dragging = false, startX = 0, startY = 0;

    function apply() {
      diagram.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    }

    // Freezes the image's current (CSS fit-to-viewport, flex-centered)
    // on-screen box as the scale=1 baseline for the transform below, then
    // switches it to absolute positioning so translate/scale fully
    // describe its box going forward. Reading the real rendered rect here
    // sidesteps ever needing the SVG's intrinsic pixel size.
    function ensureZoomMode() {
      if (zoomActive) return;
      const vRect = viewport.getBoundingClientRect();
      const iRect = diagram.getBoundingClientRect();
      diagram.classList.add('zooming');
      diagram.style.width = iRect.width + 'px';
      diagram.style.height = iRect.height + 'px';
      x = iRect.left - vRect.left;
      y = iRect.top - vRect.top;
      scale = 1;
      zoomActive = true;
      apply();
    }

    function resetZoom() {
      zoomActive = false;
      diagram.classList.remove('zooming');
      diagram.style.transform = '';
      diagram.style.width = '';
      diagram.style.height = '';
    }

    function zoomAt(factor, clientX, clientY) {
      ensureZoomMode();
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const newScale = Math.min(10, Math.max(0.05, scale * factor));
      x = px - ((px - x) / scale) * newScale;
      y = py - ((py - y) / scale) * newScale;
      scale = newScale;
      apply();
    }

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(factor, e.clientX, e.clientY);
    }, { passive: false });

    viewport.addEventListener('mousedown', (e) => {
      ensureZoomMode();
      dragging = true;
      startX = e.clientX - x;
      startY = e.clientY - y;
      viewport.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      x = e.clientX - startX;
      y = e.clientY - startY;
      apply();
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
      viewport.classList.remove('dragging');
    });

    viewport.addEventListener('dblclick', resetZoom);

    document.getElementById('zoom-in').addEventListener('click', () => {
      const rect = viewport.getBoundingClientRect();
      zoomAt(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
      const rect = viewport.getBoundingClientRect();
      zoomAt(1 / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    document.getElementById('zoom-reset').addEventListener('click', resetZoom);
  </script>
</body>
</html>`;
}

/**
 * Resolves which mermaid block a command invocation should act on: the code
 * passed directly (from a CodeLens), or a prompt to pick one from the active
 * editor when the command was run from the palette/context menu instead.
 */
async function resolveCode(code?: string): Promise<string | undefined> {
  if (code) {
    return code;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return undefined;
  }

  const blocks = findBlocks(editor.document);
  if (blocks.length === 0) {
    vscode.window.showWarningMessage(
      editor.document.languageId === 'markdown'
        ? 'No mermaid blocks found in this Markdown file.'
        : 'No mermaid blocks found in JSDoc comments.'
    );
    return undefined;
  }

  if (blocks.length === 1) {
    return blocks[0].code;
  }

  const picked = await vscode.window.showQuickPick(
    blocks.map((block) => ({
      label: `Line ${block.startLine + 1}`,
      description: block.code.split('\n')[0]?.trim() ?? '',
      block,
    })),
    { placeHolder: 'Select a mermaid diagram' }
  );

  return picked?.block.code;
}

class MermaidCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findBlocks(document).flatMap((block) => {
      const range = new vscode.Range(block.startLine, 0, block.startLine, 0);
      return [
        new vscode.CodeLens(range, {
          title: '▶ Open in Mermaid Live',
          command: 'mermaidJsdocViewer.openDiagram',
          arguments: [block.code],
        }),
        new vscode.CodeLens(range, {
          title: 'Display',
          command: 'mermaidJsdocViewer.displayDiagram',
          arguments: [block.code],
        }),
      ];
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'markdown',
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, new MermaidCodeLensProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidJsdocViewer.openDiagram', async (code?: string) => {
      const resolved = await resolveCode(code);
      if (resolved) {
        await openInMermaidLive(resolved);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidJsdocViewer.displayDiagram', async (code?: string) => {
      const resolved = await resolveCode(code);
      if (resolved) {
        displayDiagram(resolved);
      }
    })
  );
}

export function deactivate(): void {}
