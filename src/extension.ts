import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ReadingPanel } from './readingPanel';

// macOS/Windows: one persistent helper process holding a warm speech engine
// (see media/tts-mac.js and media/tts-win.ps1). Paying the engine's ~1s
// init cost once at startup means every click after that starts speaking in
// single-digit milliseconds, instead of ~2.5s per click for a fresh `say`.
let helper: ChildProcess | null = null;

// Linux: espeak has no meaningful cold-start, so it's spawned per click as before.
let linuxProcess: ChildProcess | null = null;

let isSpeaking = false;

// True once the helper has finished creating its speech engine and is
// reading its command loop. Commands sent before this point would just sit
// in the OS pipe and all fire in a burst once the loop starts, so instead
// we hold only the LATEST one and flush it on READY.
let helperReady = false;
let pendingCommand: Record<string, unknown> | null = null;

let log: vscode.OutputChannel;

function logLine(msg: string) {
    log.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

function getTtsConfig(): { voice: string; rate: number } {
    const config = vscode.workspace.getConfiguration('readJupyterNotebookCell');
    return {
        voice: config.get<string>('voice', ''),
        rate: config.get<number>('rate', 1)
    };
}

// Spawn (once) the persistent mac/win helper and wire up its status lines.
function ensureHelper(context: vscode.ExtensionContext): ChildProcess {
    if (helper) { return helper; }

    const scriptPath = process.platform === 'darwin'
        ? context.asAbsolutePath('media/tts-mac.js')
        : context.asAbsolutePath('media/tts-win.ps1');
    logLine(`spawning helper: ${scriptPath}`);

    const proc = process.platform === 'darwin'
        ? spawn('osascript', ['-l', 'JavaScript', scriptPath])
        : spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]);

    helper = proc;
    helperReady = false;
    pendingCommand = null;

    let buf = '';
    proc.stdout?.on('data', (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            logLine(`helper stdout: ${line}`);
            if (line === 'DONE') {
                isSpeaking = false;
                ReadingPanel.notifySpoken();
            } else if (line === 'READY') {
                helperReady = true;
                if (pendingCommand) {
                    const cmd = pendingCommand;
                    pendingCommand = null;
                    logLine(`flushing queued command: ${JSON.stringify(cmd)}`);
                    proc.stdin?.write(Buffer.from(JSON.stringify(cmd)).toString('base64') + '\n');
                }
            }
        }
    });

    proc.stderr?.on('data', (chunk) => {
        logLine(`helper stderr: ${chunk.toString().trim()}`);
    });

    proc.on('error', (err) => {
        logLine(`helper error: ${err.message}`);
        vscode.window.showErrorMessage(`Read Cell: failed to start TTS helper: ${err.message}`);
        helper = null;
        helperReady = false;
        pendingCommand = null;
        isSpeaking = false;
    });

    proc.on('exit', (code, signal) => {
        logLine(`helper exited: code=${code} signal=${signal}`);
        helper = null;
        helperReady = false;
        pendingCommand = null;
        isSpeaking = false;
    });

    return proc;
}

function sendHelperCommand(context: vscode.ExtensionContext, cmd: Record<string, unknown>) {
    const proc = ensureHelper(context);
    if (!helperReady) {
        pendingCommand = cmd;
        logLine(`queued (helper still warming up): ${JSON.stringify(cmd)}`);
        return;
    }
    logLine(`sending: ${JSON.stringify(cmd)}`);
    proc.stdin?.write(Buffer.from(JSON.stringify(cmd)).toString('base64') + '\n');
}

function speak(context: vscode.ExtensionContext, text: string, rateOverride?: number) {
    if (process.platform === 'linux') {
        // Linux: requires espeak to be installed
        const proc = spawn('espeak');
        proc.stdin?.write(text);
        proc.stdin?.end();
        linuxProcess = proc;
        isSpeaking = true;

        proc.on('error', (err) => {
            vscode.window.showErrorMessage(`Read Cell: failed to start TTS process: ${err.message}`);
            linuxProcess = null;
            isSpeaking = false;
        });
        proc.on('exit', () => {
            linuxProcess = null;
            isSpeaking = false;
            ReadingPanel.notifySpoken();
        });
        return;
    }

    const { voice, rate } = getTtsConfig();
    sendHelperCommand(context, { type: 'speak', text, voice, rate: rateOverride ?? rate });
    isSpeaking = true;
}

function stop() {
    isSpeaking = false;
    if (process.platform === 'linux') {
        linuxProcess?.kill();
        linuxProcess = null;
        return;
    }
    if (!helperReady) {
        pendingCommand = { type: 'stop' };
        logLine('queued stop (helper still warming up)');
        return;
    }
    logLine('sending: {"type":"stop"}');
    helper?.stdin?.write(Buffer.from(JSON.stringify({ type: 'stop' })).toString('base64') + '\n');
}

class SpeakCellCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const range = new vscode.Range(0, 0, 0, 0);
        const command: vscode.Command = {
            title: "▶ Read Cell",
            command: "extension.readNotebookCell",
            arguments: [document]
        };
        return [new vscode.CodeLens(range, command)];
    }
}

export function activate(context: vscode.ExtensionContext) {
    log = vscode.window.createOutputChannel('Read Jupyter Notebook Cell');
    context.subscriptions.push(log);

    if (process.platform === 'darwin' || process.platform === 'win32') {
        ensureHelper(context);
    }

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'vscode-notebook-cell' },
            new SpeakCellCodeLensProvider()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.readNotebookCell', (...args) => {
            logLine(`click received (isSpeaking=${isSpeaking}, helperReady=${helperReady})`);

            let textToRead = "";
            let kind: vscode.NotebookCellKind = vscode.NotebookCellKind.Markup;
            const arg = args[0];

            if (!arg) { return; }

            if (arg.getText) {
                textToRead = arg.getText();
                kind = arg.languageId === 'markdown' ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code;
            } else if (arg.document && arg.document.getText) {
                textToRead = arg.document.getText();
                kind = arg.kind ?? vscode.NotebookCellKind.Markup;
            } else if (arg.cell && arg.cell.document && arg.cell.document.getText) {
                textToRead = arg.cell.document.getText();
                kind = arg.cell.kind ?? vscode.NotebookCellKind.Markup;
            }

            if (!textToRead || !textToRead.trim()) { return; }

            if (isSpeaking) { stop(); }

            const panel = ReadingPanel.createOrShow(context);
            panel.setHandlers(
                (text, rate) => speak(context, text, rate),
                () => stop()
            );
            panel.render(textToRead, kind, getTtsConfig().rate);
        })
    );
}

export function deactivate() {
    helper?.kill();
    linuxProcess?.kill();
    ReadingPanel.disposeCurrent();
}
