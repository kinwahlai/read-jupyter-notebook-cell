import * as vscode from 'vscode';
import { exec } from 'child_process';

let currentAudioProcess: any = null;

// Keep the CodeLens you know works (for edit mode)
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
    // 1. Register CodeLens
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'vscode-notebook-cell' }, 
            new SpeakCellCodeLensProvider()
        )
    );

    // 2. Register the smart command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.readNotebookCell', (...args) => {
            let textToRead = "";
            const arg = args[0];
            
            if (!arg) { return; }

            // Route 1: Triggered by CodeLens (arg is TextDocument)
            if (arg.getText) {
                textToRead = arg.getText();
            } 
            // Route 2: Triggered by Toolbar directly (arg is NotebookCell)
            else if (arg.document && arg.document.getText) {
                textToRead = arg.document.getText();
            } 
            // Route 3: Triggered by Toolbar Context (arg is an object containing 'cell')
            else if (arg.cell && arg.cell.document && arg.cell.document.getText) {
                textToRead = arg.cell.document.getText();
            }

            if (!textToRead || !textToRead.trim()) { return; }

            if (currentAudioProcess) {
                currentAudioProcess.kill();
            }

            const safeText = textToRead.replace(/"/g, '\\"');
            currentAudioProcess = exec(`say "${safeText}"`);
        })
    );
}

export function deactivate() {
    if (currentAudioProcess) {
        currentAudioProcess.kill();
    }
}