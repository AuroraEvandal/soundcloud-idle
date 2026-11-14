# Beat Lab sample kits

15 selected one-shots, 807,338 bytes in total (plus a 4,044-byte silent media-route clip).
Mono 32 kHz, PCM16 WAV: supported by Safari and Chromium without an audio codec dependency.
Only the selected kit's five samples are fetched on Play; decoded buffers are reused until Beat Lab closes.

Sources, both CC0-1.0 (public domain, redistribution and modification allowed):

- Michael Fischer's Roland TR-808 recordings, repackaged by Edward Loveall / TidalCycles: https://github.com/tidalcycles/sounds-tr808-fischer
- Versilian Studios / Sam Gossner, Versilian Community Sample Library (VCSL), including Yamaha TX81Z keys, glockenspiel and bowed vibraphone: https://github.com/sgossner/VCSL
- CC0 terms: https://creativecommons.org/publicdomain/zero/1.0/

These are recorded samples, not the FL Studio application or a VST plugin. No proprietary FL Studio sample bank is redistributed.

`sources.json` pins every original URL, revision, SHA-256 and derivative size. Files were trimmed, downmixed, resampled, faded and, for selected voices, filtered. The Cloud rap pad uses a bowed vibraphone recording. The silent clip contains generated zero-valued PCM and is used only as a media-route fallback in browsers without Audio Session API.

Rebuild: `python tools/prepare_beat_samples.py` from `frontend/frontend/`.
