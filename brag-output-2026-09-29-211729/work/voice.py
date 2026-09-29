# Generates the launch-video narration with Kokoro v1.0 (kokoro-onnx) and lays it on a 21 s timeline.
import json, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

MODEL_DIR = sys.argv[1]
VOICE = sys.argv[2] if len(sys.argv) > 2 else "af_heart"
SR, DUR = 24000, 20.5
LINES = [  # (start seconds, text, max seconds before the next beat)
    (0.40, "Meet GrokBot.", 1.6),
    (3.20, "Ask for anything...", 2.0),
    (6.20, "and every action waits for your okay.", 2.9),
    (9.60, "Then it gets it done, right on your machine.", 3.2),
    (13.10, "Swap models, plug in tools, and keep every chat to yourself.", 3.6),
    (17.40, "GrokBot Local. Free on GitHub.", 2.6),
]
kokoro = Kokoro(f"{MODEL_DIR}/kokoro-v1.0.onnx", f"{MODEL_DIR}/voices-v1.0.bin")
track = np.zeros(int(SR * DUR), dtype=np.float32)
report = []
for start, text, limit in LINES:
    speed = 1.0
    for _ in range(4):  # speed up slightly (max 1.2x) only if a line overruns its slot
        audio, sr = kokoro.create(text, voice=VOICE, speed=speed, lang="en-us")
        audio = np.trim_zeros(np.asarray(audio, dtype=np.float32), "fb")
        if len(audio) / sr <= limit or speed >= 1.2:
            break
        speed = round(min(1.2, speed * (len(audio) / sr) / limit + 0.01), 2)
    assert sr == SR, sr
    s = int(start * SR)
    track[s : s + len(audio)] += audio[: len(track) - s]
    report.append({"start": start, "end": round(start + len(audio) / sr, 2), "speed": speed, "text": text})
peak = np.abs(track).max()
track = track / peak * 0.9
sf.write("voice.wav", track, SR)
print(json.dumps(report, indent=1))
