# Sound effects under a shot module (the reference puts a short sound on every card, tag and highlight): synthesised,
# deterministic, mixed under the voice. python sfx.py <voice.wav> <events.json> <out.wav>
# events: [{ "t": seconds from the shot start, "kind": whoosh | pop | tick | swish | glitch, "gain": 1 }]
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(3)

def env(n, a, d):   # attack / decay envelope, in samples
    e = np.ones(n); a = max(1, a); e[:a] = np.linspace(0, 1, a); e[a:] = np.exp(-np.linspace(0, d, n - a)); return e

def bandnoise(n, lo, hi):
    x = rng.standard_normal(n); f = np.fft.rfft(x); fr = np.fft.rfftfreq(n, 1 / SR)
    f[(fr < lo) | (fr > hi)] = 0; return np.fft.irfft(f, n)

def whoosh():   # air: band noise sweeping up and down, 0.45 s
    n = int(.45 * SR); t = np.linspace(0, 1, n)
    out = np.zeros(n)
    for k, (lo, hi) in enumerate([(300, 900), (900, 2500), (2500, 6000)]):
        out += bandnoise(n, lo, hi) * np.exp(-((t - .35 - k * .06) / .18) ** 2)
    return out / np.abs(out).max() * .5

def pop():      # a paper slap: a low thump and a short bright crack
    n = int(.18 * SR); t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (140 - 300 * t) * t) * env(n, 30, 30)
    crack = bandnoise(n, 1500, 7000) * env(n, 5, 80)
    return (thump * .7 + crack * .45) * .8

def tick():     # a key: a short click
    n = int(.04 * SR); return bandnoise(n, 2000, 9000) * env(n, 3, 60) * .35

def swish():    # a marker across paper: soft noise, 0.35 s
    n = int(.35 * SR); t = np.linspace(0, 1, n)
    return bandnoise(n, 1200, 5000) * np.sin(np.pi * t) ** 1.5 * .28

def glitch():   # a digital stutter: bit-crushed noise bursts
    n = int(.22 * SR); x = bandnoise(n, 200, 8000)
    x = np.round(x / np.abs(x).max() * 6) / 6
    gate = (np.arange(n) // int(.018 * SR)) % 2
    return x * gate * env(n, 20, 6) * .4

KIND = {'whoosh': whoosh, 'pop': pop, 'tick': tick, 'swish': swish, 'glitch': glitch}

def read(p):
    w = wave.open(p); ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    a = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768; a = a.reshape(-1, ch).mean(1)
    if sr != SR: a = np.interp(np.arange(int(len(a) * SR / sr)) / SR, np.arange(len(a)) / sr, a)
    return a

voice, events, out = read(sys.argv[1]), json.load(open(sys.argv[2])), sys.argv[3]
mix = voice.copy()
for e in events:
    s = KIND[e['kind']]() * e.get('gain', 1); i = int(e['t'] * SR)
    if i >= len(mix): continue
    j = min(len(mix), i + len(s)); mix[i:j] += s[: j - i] * .5
mix = np.clip(mix, -1, 1)
w = wave.open(out, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes()); w.close()
print('mixed', len(events), 'effects')
