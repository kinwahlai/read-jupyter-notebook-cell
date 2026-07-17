# Change Log

All notable changes to the "read-jupyter-notebook-cell" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.3]

- Read/Stop button in cell toolbar + CodeLens shortcut, toggle playback.
- Cross-platform TTS: macOS (NSSpeechSynthesizer), Windows (PowerShell System.Speech), Linux (espeak).
- Warm persistent speech engine on macOS/Windows — fixes cold-start delay.
- Strip markdown link URLs and bare URLs before speech.
- Fix stuck `isSpeaking` state on arm64.
- Fix silent TTS failures: spawn via stdin, surface spawn errors.