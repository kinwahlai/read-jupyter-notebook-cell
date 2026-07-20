import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true });

function nonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 32; i++) { s += chars[Math.floor(Math.random() * chars.length)]; }
    return s;
}

function renderCell(text: string, kind: vscode.NotebookCellKind): string {
    if (kind === vscode.NotebookCellKind.Code) {
        return md.render('```\n' + text + '\n```');
    }
    return md.render(text);
}

export class ReadingPanel {
    private static current: ReadingPanel | undefined;

    private readonly disposables: vscode.Disposable[] = [];
    private lastRender: { html: string; rate: number } | undefined;
    private onSpeak: ((text: string, rate: number) => void) | undefined;
    private onStop: (() => void) | undefined;

    static createOrShow(context: vscode.ExtensionContext): ReadingPanel {
        if (ReadingPanel.current) {
            ReadingPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
            return ReadingPanel.current;
        }
        const panel = vscode.window.createWebviewPanel(
            'readJupyterNotebookCell.reader',
            'Read Cell',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
            }
        );
        ReadingPanel.current = new ReadingPanel(panel, context);
        return ReadingPanel.current;
    }

    static notifySpoken() {
        ReadingPanel.current?.post({ type: 'spoken' });
    }

    static disposeCurrent() {
        ReadingPanel.current?.dispose();
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly context: vscode.ExtensionContext
    ) {
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m), null, this.disposables);
    }

    setHandlers(onSpeak: (text: string, rate: number) => void, onStop: () => void) {
        this.onSpeak = onSpeak;
        this.onStop = onStop;
    }

    render(text: string, kind: vscode.NotebookCellKind, rate: number) {
        this.lastRender = { html: renderCell(text, kind), rate };
        this.post({ type: 'render', ...this.lastRender });
    }

    private post(message: unknown) {
        void this.panel.webview.postMessage(message);
    }

    private onMessage(m: any) {
        if (!m || typeof m.type !== 'string') { return; }
        if (m.type === 'speak') { this.onSpeak?.(String(m.text ?? ''), Number(m.rate) || 1); }
        else if (m.type === 'stop') { this.onStop?.(); }
        else if (m.type === 'ready' && this.lastRender) { this.post({ type: 'render', ...this.lastRender }); }
    }

    private getHtml(webview: vscode.Webview): string {
        const n = nonce();
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reader.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'reader.css'));
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${n}'`,
        ].join('; ');
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link href="${cssUri}" rel="stylesheet" />
<title>Read Cell</title>
</head>
<body>
<div id="app"></div>
<script nonce="${n}" src="${jsUri}"></script>
</body>
</html>`;
    }

    private dispose() {
        if (ReadingPanel.current === this) { ReadingPanel.current = undefined; }
        this.panel.dispose();
        while (this.disposables.length) { this.disposables.pop()?.dispose(); }
    }
}
