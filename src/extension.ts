import * as vscode from 'vscode';
import { exec } from 'child_process';

let currentAudioProcess: any = null;

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
            
            // TOGGLE LOGIC: If audio is currently playing, stop it and exit the function.
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

            const safeText = textToRead.replace(/"/g, '\\"');
            currentAudioProcess = exec(`say "${safeText}"`);

            // RESET LOGIC: Clear the variable when the audio finishes naturally
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