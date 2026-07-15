import * as vscode from 'vscode';
import { exec } from 'child_process';

let currentAudioProcess: any = null;

// Helper function to detect OS and generate the correct command
function getTtsCommand(text: string): string {
    if (process.platform === 'darwin') {
        // macOS: use 'say'
        const safeText = text.replace(/"/g, '\\"');
        return `say "${safeText}"`;
    } else if (process.platform === 'win32') {
        // Windows: use PowerShell and the System.Speech API
        // We escape single quotes by doubling them ('') for PowerShell
        const safeText = text.replace(/'/g, "''");
        return `powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${safeText}')"`;
    } else {
        // Linux: default to 'espeak' (requires espeak to be installed)
        const safeText = text.replace(/"/g, '\\"');
        return `espeak "${safeText}"`;
    }
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

            if (!textToRead || !textToRead.trim()) { return; }

            // Get the correct command for Mac or Windows
            const commandToRun = getTtsCommand(textToRead);
            currentAudioProcess = exec(commandToRun);

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