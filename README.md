# Read Jupyter Notebook Cell

A VS Code extension that reads Jupyter notebook cells aloud using your OS's text-to-speech engine.

Built for anyone who has a hard time focusing on long blocks of text on screen, wants an accessible way to review notebooks by ear, or just wants a hands-free way to skim cell content.

## Features

- **▶ Read/Stop button** in the notebook cell toolbar — click to read the cell's content aloud, click again to stop.
- **CodeLens shortcut** above each cell as an alternative trigger.
- **Toggle playback** — starting a new read stops whatever is currently playing.
- **Cross-platform TTS**, using each OS's native voice:
  - macOS: `say`
  - Windows: PowerShell `System.Speech`
  - Linux: `espeak`

## Requirements

- macOS and Windows: no setup needed, uses the built-in OS TTS.
- Linux: requires `espeak` to be installed separately, e.g. `sudo apt install espeak`.

## Usage

1. Open a Jupyter notebook (`.ipynb`) in VS Code.
2. Hover over a cell and click the **Read/Stop** icon in the cell toolbar (or the CodeLens link above the cell).
3. Click it again to stop playback early.

## Known Issues

- Linux requires `espeak` to be installed separately; it isn't bundled with the extension.
- No controls yet for voice, speed, or language — playback uses the OS default voice.
- Only one cell can read at a time; starting a new read stops the previous one.

## Installation

This extension isn't published on the Marketplace yet. To try it from source:

```bash
git clone git@github.com:kinwahlai/read-jupyter-notebook-cell.git
cd read-jupyter-notebook-cell
pnpm install
```

Then open the folder in VS Code and press `F5` to launch an Extension Development Host with the extension loaded.

## License

[MIT](LICENSE)
