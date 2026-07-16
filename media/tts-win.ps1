# Persistent Windows TTS helper.
#
# Creating a SpeechSynthesizer has real init cost; this process pays it once
# at startup and stays alive, reusing the same synthesizer so every
# subsequent utterance starts near-instantly.
#
# Protocol (line-delimited on stdin, one base64-encoded JSON command per line):
#   base64({ type: "speak", text, voice, rate })
#   base64({ type: "stop" })
# Status lines on stdout: SPEAKING, DONE

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

Register-ObjectEvent -InputObject $synth -EventName SpeakCompleted -Action {
    [Console]::Out.WriteLine("DONE")
    [Console]::Out.Flush()
} | Out-Null

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line -eq '') { continue }

    $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($line))
    $cmd = $json | ConvertFrom-Json

    if ($cmd.type -eq 'speak') {
        if ($cmd.voice) {
            try { $synth.SelectVoice($cmd.voice) } catch { }
        }
        $rate = if ($cmd.rate) { $cmd.rate } else { 1 }
        # SAPI Rate is -10..10 (0 = default), not a multiplier. Map our
        # 0.5..2 multiplier onto that scale: 1.0 -> 0, 2.0 -> 10, 0.5 -> -5.
        $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int](($rate - 1) * 10)))
        $synth.SpeakAsyncCancelAll()
        $synth.SpeakAsync($cmd.text)
        [Console]::Out.WriteLine("SPEAKING")
        [Console]::Out.Flush()
    } elseif ($cmd.type -eq 'stop') {
        $synth.SpeakAsyncCancelAll()
    }
}
