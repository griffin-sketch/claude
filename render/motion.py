"""How much a clip actually moves. Used to catch AI takes where the camera barely moved."""
import subprocess
import numpy as np

def motion_score(path, w=96, h=54):
    """Mean pixel change between frames 0.5 s apart (0-255 scale), on a small grayscale copy.
    A real camera move scores well above 4; a near-still take scores around 1."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps=2,scale={w}:{h},format=gray",
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    n = len(raw) // (w * h)
    if n < 3:
        return 0.0
    f = np.frombuffer(raw[:n * w * h], dtype=np.uint8).reshape(n, h, w).astype(np.float32)
    steps = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    return float(np.median(steps))

if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        print(f"{motion_score(p):6.2f}  {p}")
