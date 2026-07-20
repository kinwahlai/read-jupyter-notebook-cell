# Read Jupyter Notebook Cell

A VS Code extension that reads Jupyter notebook cells aloud using your OS's text-to-speech engine.

Built for anyone who has a hard time focusing on long blocks of text on screen, wants an accessible way to review notebooks by ear, or just wants a hands-free way to skim cell content.

## Features

- **▶ Read Cell button** in the notebook cell toolbar — click to open a reading panel
  beside the notebook, rendering the cell as clean prose (or, for code cells, a
  syntax-highlighted block) and reading it aloud.
- **Sentence-by-sentence highlighting** — the sentence currently being spoken is
  highlighted in the panel and auto-scrolled into view as playback advances.
- **Reading panel controls** — Play/Pause, speed slider, Follow (auto-scroll),
  Focus (dim non-active sentences), and Glow (ambient highlight) toggles. Click any
  sentence to jump playback there.
- **CodeLens shortcut** above each cell as an alternative trigger.
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
2. Hover over a cell and click the **Read Cell** icon in the cell toolbar (or the CodeLens link above the cell).
3. A reading panel opens beside the notebook and starts reading; use its Play/Pause
   button, speed slider, or click any sentence to control playback.

## Known Issues

- Linux requires `espeak` to be installed separately; it isn't bundled with the extension.
- No language control — playback uses the OS default voice's language.
- The reading panel shows one cell at a time; reading a new cell replaces its content.
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

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ElevatesLife.read-jupyter-notebook-cell), or build from source:

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
  code --install-extension read-jupyter-notebook-cell-0.0.4.vsix
  ```

  Then reload the window (`Cmd/Ctrl+Shift+P` → "Reload Window") to activate it.

## License

[MIT](LICENSE)
