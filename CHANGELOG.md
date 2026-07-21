# Change Log

All notable changes to the "read-jupyter-notebook-cell" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.5]

- LaTeX math (`$...$` and `$$...$$`) now renders via KaTeX instead of showing
  the raw delimiters/backslashes as literal text.
- Speech reads the stripped LaTeX source for math (e.g. `$L_\infty$` is spoken
  as "L_infty"), not KaTeX's rendered glyph text.
- Table rows are now read aloud, one row per utterance, as "Header: cell.
  Header: cell." — previously tables were shown but silently skipped.

## [0.0.4]

- Reading panel: ▶ Read Cell now opens a webview beside the notebook that renders
  the cell as prose and reads it aloud, highlighting each sentence as it's spoken.
- Code cells (and fenced code blocks) are shown as a syntax-highlighted block but
  are not read aloud — playback skips them and continues at the next sentence.
- Sentence-by-sentence highlighting synced to playback, with auto-scroll.
- Panel controls: Play/Pause, speed presets + slider with a live value label,
  Follow/Focus/Glow toggles, click-to-jump.
- Changing speed in the panel persists it to `readJupyterNotebookCell.rate`.
- Fix: manually line-wrapped prose in the source markdown no longer fragments
  the sentence highlight (`Intl.Segmenter` was treating soft-wrap newlines as
  sentence boundaries).

## [0.0.3]

- Read/Stop button in cell toolbar + CodeLens shortcut, toggle playback.
- Cross-platform TTS: macOS (NSSpeechSynthesizer), Windows (PowerShell System.Speech), Linux (espeak).
- Warm persistent speech engine on macOS/Windows — fixes cold-start delay.
- Strip markdown link URLs and bare URLs before speech.
- Fix stuck `isSpeaking` state on arm64.
- Fix silent TTS failures: spawn via stdin, surface spawn errors.