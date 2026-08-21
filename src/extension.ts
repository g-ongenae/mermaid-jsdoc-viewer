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

function displayDiagram(code: string): void {
  const imageUrl = buildMermaidInkUrl(code);

  if (displayPanel) {
    displayPanel.reveal(vscode.ViewColumn.Beside, true);
  } else {
    displayPanel = vscode.window.createWebviewPanel(
      'mermaidJsdocViewer.display',
      'Mermaid Diagram',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false }
    );
    displayPanel.onDidDispose(() => {
      displayPanel = undefined;
    });
  }

  displayPanel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://mermaid.ink;">
<style>
  body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: var(--vscode-editor-background); }
  img { max-width: 100%; max-height: 100%; }
</style>
</head>
<body>
  <img src="${imageUrl}" alt="Mermaid diagram" />
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

  const blocks = findMermaidBlocks(editor.document);
  if (blocks.length === 0) {
    vscode.window.showWarningMessage('No mermaid blocks found in JSDoc comments.');
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
    return findMermaidBlocks(document).flatMap((block) => {
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
