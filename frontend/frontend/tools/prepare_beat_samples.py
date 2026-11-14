"""Build the small CC0 Beat Lab kits; downloads only the selected source WAVs."""
import array
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request
import wave

OUT = Path(__file__).resolve().parents[1] / 'public/audio/beatlab'
REPOS = {
    '808': ('tidalcycles/sounds-tr808-fischer', '85fbecf1bec32553395625ea659e2a56dfd7c0e1'),
    'vcsl': ('sgossner/VCSL', 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e'),
}
# genre, lane, source, path, maximum seconds, low-pass Hz (0 = none)
SAMPLES = [
    ('trap', 'kick', '808', 'bd8/BD5075.WAV', .65, 0),
    ('trap', 'snare', '808', 'sd8/SD0050.WAV', .35, 0),
    ('trap', 'hihat', '808', 'ch8/CH.WAV', .16, 0),
    ('trap', 'piano', 'vcsl', 'Electrophones/TX81Z/FM Piano/FMPiano_C4_vl3.wav', 1.5, 4500),
    ('trap', 'melody', 'vcsl', 'Electrophones/TX81Z/Clavisynth/Clavisynth_C5_vl3.wav', 1.2, 0),
    ('plugg', 'kick', '808', 'bd8/BD2500.WAV', .25, 0),
    ('plugg', 'snare', '808', 'cp8/CP.WAV', .45, 0),
    ('plugg', 'hihat', '808', 'ch8/CH.WAV', .12, 7500),
    ('plugg', 'piano', 'vcsl', 'Electrophones/TX81Z/Piano 1/Piano 1_C4_vl2.wav', 1.5, 0),
    ('plugg', 'melody', 'vcsl', 'Idiophones/Struck Idiophones/Glockenspiel/glock_soft_C5_02.wav', 1.8, 0),
    ('cloud_rap', 'kick', '808', 'bd8/BD5025.WAV', .4, 1800),
    ('cloud_rap', 'snare', '808', 'sd8/SD0000.WAV', .3, 3500),
    ('cloud_rap', 'hihat', '808', 'ch8/CH.WAV', .18, 5000),
    ('cloud_rap', 'piano', 'vcsl', 'Electrophones/TX81Z/FM Piano/FMPiano_C4_vl1.wav', 1.8, 2200),
    ('cloud_rap', 'melody', 'vcsl', 'Idiophones/Struck Idiophones/Vibraphone/Bowed/Vibes_bowed_D4_rr1_Main.wav', 2.2, 4000),
]

def build():
    cache, manifest = {}, []
    OUT.mkdir(parents=True, exist_ok=True)
    for genre, lane, source, path, duration, cutoff in SAMPLES:
        repo, revision = REPOS[source]
        url = f'https://raw.githubusercontent.com/{repo}/{revision}/{urllib.parse.quote(path)}'
        if url not in cache:
            with urllib.request.urlopen(url, timeout=30) as response:
                cache[url] = response.read()
        with wave.open(io.BytesIO(cache[url]), 'rb') as wav:
            channels, width, rate = wav.getnchannels(), wav.getsampwidth(), wav.getframerate()
            raw = wav.readframes(wav.getnframes())
        assert width in (2, 3, 4), (path, width)
        values = [int.from_bytes(raw[i:i+width], 'little', signed=True) / (2 ** (width*8-1)) for i in range(0, len(raw), width)]
        mono = [sum(values[i:i+channels])/channels for i in range(0, len(values), channels)]
        start = next((i for i, value in enumerate(mono) if abs(value) > .002), 0)
        mono = mono[max(0, start-int(rate*.003)):][:int(rate*duration)]
        target_rate = 32000
        output = []
        previous = 0
        alpha = 1-math.exp(-2*math.pi*cutoff/target_rate) if cutoff else 1
        for i in range(int(len(mono)*target_rate/rate)):
            at = i*rate/target_rate
            index = int(at)
            value = mono[index]*(1-at+index) + mono[min(index+1, len(mono)-1)]*(at-index)
            previous += alpha*(value-previous)
            output.append(previous)
        peak = max(abs(value) for value in output)
        assert peak > .001, f'Silent source: {path}'
        fade_in = .08 if genre == 'cloud_rap' and lane == 'melody' else .002
        fade_out = .16 if lane in ('piano', 'melody') else .015
        pcm = array.array('h', (round(value/peak*.85*32767*min(1, i/(target_rate*fade_in), (len(output)-1-i)/(target_rate*fade_out))) for i, value in enumerate(output)))
        folder = OUT / genre
        folder.mkdir(exist_ok=True)
        file = folder / f'{lane}.wav'
        with wave.open(str(file), 'wb') as wav:
            wav.setparams((1, 2, target_rate, 0, 'NONE', 'not compressed'))
            wav.writeframes(pcm.tobytes())
        manifest.append({'file':f'{genre}/{lane}.wav', 'source':url, 'source_sha256':hashlib.sha256(cache[url]).hexdigest(), 'license':'CC0-1.0', 'bytes':file.stat().st_size, 'seconds':round(len(pcm)/target_rate, 3)})
    with wave.open(str(OUT/'silence.wav'), 'wb') as wav:
        wav.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
        wav.writeframes(bytes(4000))
    total = sum(sample['bytes'] for sample in manifest)
    assert total < 1_000_000, f'Audio budget exceeded: {total}'
    (OUT/'sources.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(f'{len(manifest)} samples, {total:,} bytes total; mono 32 kHz PCM16')

if __name__ == '__main__':
    build()
