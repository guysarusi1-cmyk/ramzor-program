# Records the narration of the training videos (14zh-learn.js) once, so that it plays on every phone (a phone's own voice is often silent).
# Every "say" of the videos becomes a small m4a file in src\public\learn\ (named by the text), and src\scripts\14zi-learn-voice.js tells the
# player which file belongs to which sentence. A sentence with no file is read by the device's own voice, when it has a Hebrew one.
# Run after changing a sentence:  .\tools\learn-voice.ps1
# The voice: Microsoft's neural Hebrew voice (Azure) when config\speech.local.json has { "key":"...", "region":"westeurope", "voice":"he-IL-HilaNeural" }
# (that file is never committed and never goes into the site); without it, Windows' own Hebrew voice "Asaf" (no internet needed, sounds robotic).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src = [IO.File]::ReadAllText((Join-Path $root 'src\scripts\14zh-learn.js'), [Text.Encoding]::UTF8)
$texts = [regex]::Matches($src, "say:'([^']*)'") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique          # (a sentence has no ' inside)
$outDir = Join-Path $root 'src\public\learn'; New-Item -ItemType Directory -Force $outDir | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$ms = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
$asOp = $ms | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asActP = $ms | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' } | Select-Object -First 1
function Await($op, [Type]$t){ $task = $asOp.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFolder,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Media.Transcoding.MediaTranscoder,Windows.Media.Transcoding,ContentType=WindowsRuntime]
$null = [Windows.Media.MediaProperties.MediaEncodingProfile,Windows.Media.MediaProperties,ContentType=WindowsRuntime]
$azPath = Join-Path $root 'config\speech.local.json'
$az = if(Test-Path $azPath){ Get-Content $azPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$azVoice = if($az -and $az.voice){ $az.voice } else { 'he-IL-HilaNeural' }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -like 'he*' } | Select-Object -First 1
if(-not $voice){ throw 'no Hebrew voice in Windows (Settings > Time & language > Speech: add Hebrew)' }
$synth.Voice = $voice
$folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($outDir)) ([Windows.Storage.StorageFolder])
$prof = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a([Windows.Media.MediaProperties.AudioEncodingQuality]::Low)
$prof.Audio.Bitrate = 32000; $prof.Audio.ChannelCount = 1; $prof.Audio.SampleRate = 22050          # (speech: small files)
$sha = [Security.Cryptography.SHA1]::Create()
$map = [ordered]@{}; $made = 0
foreach($t in $texts){
  $key = if($az){ "$azVoice|$t" } else { $t }          # (the voice is part of the name: another voice records everything again)
  $name = (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | Select-Object -First 6 | ForEach-Object { $_.ToString('x2') }) -join '') + $(if($az){ '.mp3' } else { '.m4a' })
  $map[$t] = $name
  if(Test-Path (Join-Path $outDir $name)){ continue }
  # what is read differs a little from what is written: no quotes, "יכול/ה" read as one word
  $speak = $t -replace '[„”"׳]', '' -replace '/ה', '' -replace '\.\.\.', ','
  if($az){
    $ssml = "<speak version='1.0' xml:lang='he-IL'><voice name='$azVoice'><prosody rate='-4%'>" + [Security.SecurityElement]::Escape($speak) + "</prosody></voice></speak>"
    $headers = @{ 'Ocp-Apim-Subscription-Key' = $az.key; 'X-Microsoft-OutputFormat' = 'audio-24khz-48kbitrate-mono-mp3'; 'User-Agent' = 'ramzor-learn' }
    Invoke-WebRequest -Uri "https://$($az.region).tts.speech.microsoft.com/cognitiveservices/v1" -Method Post -Headers $headers -ContentType 'application/ssml+xml; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($ssml)) -OutFile (Join-Path $outDir $name) -UseBasicParsing
    $made++; continue
  }
  $stream = Await ($synth.SynthesizeTextToStreamAsync($speak)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size; $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32]); $bytes = New-Object byte[] $size; $reader.ReadBytes($bytes)
  $wav = Join-Path $env:TEMP "learn-voice-$name.wav"; [IO.File]::WriteAllBytes($wav, $bytes)
  $in = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($wav)) ([Windows.Storage.StorageFile])
  $out = Await ($folder.CreateFileAsync($name, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $prep = Await ((New-Object Windows.Media.Transcoding.MediaTranscoder).PrepareFileTranscodeAsync($in, $out, $prof)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
  if(-not $prep.CanTranscode){ throw "cannot encode: $($prep.FailureReason)" }
  $task = $asActP.MakeGenericMethod([double]).Invoke($null, @($prep.TranscodeAsync())); $task.Wait(-1) | Out-Null
  Remove-Item $wav; $made++
}
# files of sentences that are gone
Get-ChildItem $outDir -File | Where-Object { $map.Values -notcontains $_.Name } | ForEach-Object { Remove-Item $_.FullName; Write-Host "removed $($_.Name)" }
$js = "// ---------- THE RECORDED NARRATION of the training videos: made by tools\learn-voice.ps1, do not edit by hand ----------`n// sentence -> file in learn\ (next to the page). A sentence that is not here is read by the device's own voice.`nconst LEARN_VOICE = " + ($map | ConvertTo-Json -Compress) + ";`n"
[IO.File]::WriteAllText((Join-Path $root 'src\scripts\14zi-learn-voice.js'), $js, (New-Object Text.UTF8Encoding($false)))
$kb = [math]::Round(((Get-ChildItem $outDir -File | Measure-Object Length -Sum).Sum) / 1KB)
Write-Host "$($map.Count) sentences, $made recorded now, $kb KB in all ($(if($az){ $azVoice } else { $voice.DisplayName }))"
