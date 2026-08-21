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
 * Compresses mermaid source with pako and builds a mermaid.live edit URL,
 * matching the `pako:` state encoding used by https://mermaid.live.
 */
function buildMermaidLiveUrl(code: string): string {
  const state = {
    code,
    mermaid: { theme: 'default' },
    autoSync: true,
    updateDiagram: true,
  };
  const deflated = pako.deflate(JSON.stringify(state), { level: 9 });
  const base64 = Buffer.from(deflated).toString('base64url');
  return `https://mermaid.live/edit#pako:${base64}`;
}

async function openInMermaidLive(code: string): Promise<void> {
  const url = buildMermaidLiveUrl(code);
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

class MermaidCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findMermaidBlocks(document).map((block) => {
      const range = new vscode.Range(block.startLine, 0, block.startLine, 0);
      return new vscode.CodeLens(range, {
        title: '▶ Open in Mermaid Live',
        command: 'mermaidJsdocViewer.openDiagram',
        arguments: [block.code],
      });
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
    vscode.commands.registerCommand(
      'mermaidJsdocViewer.openDiagram',
      async (code?: string) => {
        if (code) {
          await openInMermaidLive(code);
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('No active editor.');
          return;
        }

        const blocks = findMermaidBlocks(editor.document);
        if (blocks.length === 0) {
          vscode.window.showWarningMessage('No mermaid blocks found in JSDoc comments.');
          return;
        }

        if (blocks.length === 1) {
          await openInMermaidLive(blocks[0].code);
          return;
        }

        const picked = await vscode.window.showQuickPick(
          blocks.map((block) => ({
            label: `Line ${block.startLine + 1}`,
            description: block.code.split('\n')[0]?.trim() ?? '',
            block,
          })),
          { placeHolder: 'Select a mermaid diagram to open' }
        );

        if (picked) {
          await openInMermaidLive(picked.block.code);
        }
      }
    )
  );
}

export function deactivate(): void {}
