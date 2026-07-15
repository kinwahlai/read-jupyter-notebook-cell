import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

let currentAudioProcess: ChildProcess | null = null;

// Strip content that isn't meaningful to speak aloud: fenced code blocks,
// markdown images, link URLs (keep only the link text), and bare URLs.
function stripUnspeakable(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '');
}

// Spawn the OS TTS process directly (no shell) and feed text over stdin,
// so long text or shell-special characters (`, $, !, newlines...) never
// have to survive a shell command line.
function speak(text: string): ChildProcess {
    let proc: ChildProcess;
    if (process.platform === 'darwin') {
        proc = spawn('say');
    } else if (process.platform === 'win32') {
        proc = spawn('powershell', [
            '-NoProfile',
            '-Command',
            'Add-Type -AssemblyName System.Speech; ' +
            '$text = [Console]::In.ReadToEnd(); ' +
            '(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($text)'
        ]);
    } else {
        // Linux: requires espeak to be installed
        proc = spawn('espeak');
    }
    proc.stdin?.write(text);
    proc.stdin?.end();
    return proc;
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
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'vscode-notebook-cell' }, 
            new SpeakCellCodeLensProvider()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.readNotebookCell', (...args) => {
            
            if (currentAudioProcess) {
                currentAudioProcess.kill();
                currentAudioProcess = null;
                return;
            }

            let textToRead = "";
            const arg = args[0];
            
            if (!arg) { return; }

            if (arg.getText) {
                textToRead = arg.getText();
            } else if (arg.document && arg.document.getText) {
                textToRead = arg.document.getText();
            } else if (arg.cell && arg.cell.document && arg.cell.document.getText) {
                textToRead = arg.cell.document.getText();
            }

            textToRead = stripUnspeakable(textToRead);

            if (!textToRead || !textToRead.trim()) { return; }

            currentAudioProcess = speak(textToRead);

            currentAudioProcess.on('error', (err) => {
                vscode.window.showErrorMessage(`Read Cell: failed to start TTS process: ${err.message}`);
                currentAudioProcess = null;
            });

            currentAudioProcess.on('exit', () => {
                currentAudioProcess = null;
            });
        })
    );
}

export function deactivate() {
    if (currentAudioProcess) {
        currentAudioProcess.kill();
    }
}