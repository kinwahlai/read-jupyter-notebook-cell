# Read Jupyter Notebook Cell

A VS Code extension that reads Jupyter notebook cells aloud using your OS's text-to-speech engine.

Built for anyone who has a hard time focusing on long blocks of text on screen, wants an accessible way to review notebooks by ear, or just wants a hands-free way to skim cell content.

## Features

- **▶ Read/Stop button** in the notebook cell toolbar — click to read the cell's content aloud, click again to stop.
- **CodeLens shortcut** above each cell as an alternative trigger.
- **Toggle playback** — starting a new read stops whatever is currently playing.
- **Cross-platform TTS**, using each OS's native voice:
  - macOS: `NSSpeechSynthesizer` (same voices as `say`), driven via a persistent helper process
  - Windows: PowerShell `System.Speech`, driven via a persistent helper process
  - Linux: `espeak`

On macOS and Windows, the extension keeps one speech engine warm in the background
(started on activation) instead of spawning a fresh process per click, so reads after
the first are near-instant.

## Requirements

- macOS and Windows: no setup needed, uses the built-in OS TTS.
- Linux: requires `espeak` to be installed separately, e.g. `sudo apt install espeak`.

## Settings

- `readJupyterNotebookCell.voice` — exact TTS voice name to use. Empty (default) uses
  the OS default voice. Find available names with `say -v '?'` on macOS, or by
  listing installed voices in Windows Settings.
- `readJupyterNotebookCell.rate` — speech rate multiplier, `0.5`–`2` (default `1`).

## Usage

1. Open a Jupyter notebook (`.ipynb`) in VS Code.
2. Hover over a cell and click the **Read/Stop** icon in the cell toolbar (or the CodeLens link above the cell).
3. Click it again to stop playback early.

## Known Issues

- Linux requires `espeak` to be installed separately; it isn't bundled with the extension.
- No language control — playback uses the OS default voice's language.
- Only one cell can read at a time; starting a new read stops the previous one.
- Linux still spawns a fresh `espeak` process per click (lightweight, no noticeable delay);
  macOS/Windows use a warm persistent process instead.
- Only tested on macOS so far. The Windows (`media/tts-win.ps1`) and Linux (`espeak`)
  paths are implemented but unverified — please report issues if you try them.
- Occasionally the click itself takes ~1s to reach the extension before it starts
  reading. Confirmed via the "Read Jupyter Notebook Cell" output channel that this
  happens *before* our command handler runs, so it isn't the TTS engine — likely
  general VS Code/notebook UI responsiveness rather than something this extension
  can fix.

## Installation

This extension isn't published on the Marketplace yet. To try it from source:

```bash
git clone git@github.com:kinwahlai/read-jupyter-notebook-cell.git
cd read-jupyter-notebook-cell
pnpm install
```

Then either:

- Press `F5` to launch an Extension Development Host with the extension loaded, or
- Install it into your regular VS Code as a `.vsix`:

  ```bash
  pnpm add -D @vscode/vsce
  pnpm exec vsce package
  code --install-extension read-jupyter-notebook-cell-0.0.2.vsix
  ```

  Then reload the window (`Cmd/Ctrl+Shift+P` → "Reload Window") to activate it.

## License

[MIT](LICENSE)
