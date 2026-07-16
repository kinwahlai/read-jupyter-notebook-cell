// Persistent macOS TTS helper, run via `osascript -l JavaScript`.
//
// Creating NSSpeechSynthesizer costs ~1s (one-time XPC handshake with the
// speech daemon + voice catalog load). This process pays that cost once at
// startup, then stays alive reusing the same synthesizer, so every
// subsequent utterance starts in single-digit milliseconds.
//
// Protocol (line-delimited on stdin, one base64-encoded JSON command per line):
//   base64({ type: "speak", text, voice, rate })
//   base64({ type: "stop" })
// Status lines on stdout (via console.log, which JXA sends to stderr... see
// note below — we print via NSFileHandle instead so Node can read it from stdout):
//   SPEAKING
//   DONE

ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.bindFunction('fcntl', ['int', ['int', 'int', 'int']]);

const F_GETFL = 3, F_SETFL = 4, O_NONBLOCK = 0x0004;
const flags = $.fcntl(0, F_GETFL, 0);
$.fcntl(0, F_SETFL, flags | O_NONBLOCK);

const stdout = $.NSFileHandle.fileHandleWithStandardOutput;
function writeLine(line) {
    stdout.writeData($.NSString.alloc.initWithString(line + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
}

const synth = $.NSSpeechSynthesizer.alloc.init;
const defaultRate = synth.rate;
writeLine('READY');

function findVoiceIdentifier(name) {
    const voices = synth.availableVoices;
    for (let i = 0; i < voices.count; i++) {
        const voiceId = voices.objectAtIndex(i);
        const attrs = $.NSSpeechSynthesizer.attributesForVoice(voiceId);
        if (attrs.js['NSVoiceName'] && attrs.js['NSVoiceName'].js === name) {
            return voiceId;
        }
    }
    return null;
}

function handleCommand(json) {
    let cmd;
    try {
        cmd = JSON.parse(json);
    } catch (e) {
        return;
    }
    if (cmd.type === 'speak') {
        if (cmd.voice) {
            const id = findVoiceIdentifier(cmd.voice);
            if (id) { synth.setVoice(id); }
        }
        synth.setRate(defaultRate * (cmd.rate || 1));
        synth.stopSpeaking;
        synth.startSpeakingString(cmd.text);
        writeLine('SPEAKING');
    } else if (cmd.type === 'stop') {
        synth.stopSpeaking;
    }
}

const stdin = $.NSFileHandle.fileHandleWithStandardInput;
let buf = '';
let wasSpeaking = false;

function decodeBase64(b64) {
    const data = $.NSData.alloc.initWithBase64EncodedStringOptions(b64, 0);
    return $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
}

while (true) {
    $.NSThread.sleepForTimeInterval(0.05);

    let data = null;
    try { data = stdin.availableData; } catch (e) { /* nothing ready */ }
    if (data && data.length) {
        buf += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (line) { handleCommand(decodeBase64(line)); }
        }
    }

    const speaking = synth.speaking;
    if (speaking) { wasSpeaking = true; }
    if (wasSpeaking && !speaking) {
        writeLine('DONE');
        wasSpeaking = false;
    }
}
