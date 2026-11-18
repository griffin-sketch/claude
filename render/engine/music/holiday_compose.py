# Original arrangement of public-domain carols (Jingle Bells, 1857; Deck the Halls, traditional) for Tourvo's Holiday template.
import mido
TPB = 480; BPM = 116
mid = mido.MidiFile(ticks_per_beat=TPB)
N = {"G3":55,"A3":57,"B3":59,"C4":60,"D4":62,"E4":64,"F#4":66,"G4":67,"A4":69,"B4":71,"C5":72,"D5":74,"E5":76,"F#5":78,"G5":79}
def track(prog, ch, name):
    t = mido.MidiTrack(); mid.tracks.append(t)
    t.append(mido.MetaMessage("track_name", name=name))
    if ch != 9: t.append(mido.Message("program_change", program=prog, channel=ch))
    return t
events = {}   # track -> list of (start_tick, end_tick, note, vel, ch)
def add(tr, start, dur, note, vel, ch):
    events.setdefault(id(tr), (tr, []))[1].append((int(start*TPB), int((start+dur)*TPB), note, vel, ch))

meta = mido.MidiTrack(); mid.tracks.insert(0, meta); meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
box  = track(10, 0, "music box")   # melody
cel  = track(8, 1, "celesta")      # melody an octave down, second time through
pno  = track(0, 2, "piano")        # chords
bass = track(45, 3, "pizzicato")   # bouncing bass
pad  = track(48, 4, "strings")     # warm pad
bells= track(0, 9, "bells")

JB = [("B4",1),("B4",1),("B4",2),("B4",1),("B4",1),("B4",2),("B4",1),("D5",1),("G4",1.5),("A4",.5),("B4",4),
      ("C5",1),("C5",1),("C5",1.5),("C5",.5),("C5",1),("B4",1),("B4",1),("B4",.5),("B4",.5),("B4",1),("A4",1),("A4",1),("B4",1),("A4",2),("D5",2),
      ("B4",1),("B4",1),("B4",2),("B4",1),("B4",1),("B4",2),("B4",1),("D5",1),("G4",1.5),("A4",.5),("B4",4),
      ("C5",1),("C5",1),("C5",1.5),("C5",.5),("C5",1),("B4",1),("B4",1),("B4",.5),("B4",.5),("D5",1),("D5",1),("C5",1),("A4",1),("G4",4)]
JBC = ["G","G","G","G","C","G","D","D","G","G","G","G","C","G","D","G"]
DH = [("D5",1.5),("C5",.5),("B4",1),("A4",1),("G4",1),("A4",1),("B4",1),("G4",1),("A4",.5),("B4",.5),("C5",.5),("A4",.5),("B4",1.5),("A4",.5),("G4",1),("F#4",1),("G4",2),
      ("D5",1.5),("C5",.5),("B4",1),("A4",1),("G4",1),("A4",1),("B4",1),("G4",1),("A4",.5),("B4",.5),("C5",.5),("A4",.5),("B4",1.5),("A4",.5),("G4",1),("F#4",1),("G4",2)]
DHC = ["G","G","D","G","G","G","D","G"]
CH = {"G":[55,59,62],"C":[55,60,64],"D":[54,57,60,62]}
ROOT = {"G":(43,50),"C":(48,43),"D":(50,45)}

def section(t0, melody, chords, octave_down=False, bells_on=True, vel=92):
    t = t0
    for n, d in melody:
        add(box, t, d*0.95, N[n]+12, vel, 0)
        if octave_down: add(cel, t, d*0.95, N[n], vel-22, 1)
        t += d
    for b, c in enumerate(chords):
        s = t0 + b*4
        for beat in (1, 3):
            for k in CH[c]: add(pno, s+beat, 0.9, k, 58, 2)
        r, f = ROOT[c]
        for beat, note in ((0, r), (1, f), (2, r), (3, f)): add(bass, s+beat, 0.6, note, 80, 3)
        for k in CH[c]: add(pad, s, 4, k-12+12, 34, 4)
        if bells_on:
            for e in range(8): add(bells, s+e*0.5, 0.3, 83, 44 if e % 2 else 60, 9)
    return t0 + len(chords)*4

t = 0
# soft intro: two bars of bells and pad
for b in range(2):
    for k in CH["G"]: add(pad, b*4, 4, k, 30, 4)
    for e in range(8): add(bells, b*4+e*0.5, 0.3, 83, 50 + e*4, 9)
t = 8
t = section(t, JB, JBC, octave_down=False)
t = section(t, DH, DHC, octave_down=True, vel=86)
t = section(t, JB, JBC, octave_down=True, vel=96)
# ending: a held G chord with a last shake of bells
for k in CH["G"] + [67, 71, 74]: add(pno, t, 4, k, 64, 2)
for k in CH["G"]: add(pad, t, 6, k, 36, 4)
add(box, t, 4, N["G5"], 90, 0); add(bass, t, 2, 43, 80, 3)
for e in range(6): add(bells, t+e*0.25, 0.2, 83, 90 - e*10, 9)

for tr, evs in events.values():
    msgs = []
    for s, e, n, v, ch in evs:
        msgs.append((s, 1, mido.Message("note_on", note=n, velocity=v, channel=ch)))
        msgs.append((e, 0, mido.Message("note_off", note=n, velocity=0, channel=ch)))
    msgs.sort(key=lambda m: (m[0], m[1]))
    last = 0
    for tick, _, m in msgs:
        tr.append(m.copy(time=tick - last)); last = tick
mid.save("/tmp/claude-0/-home-claude/6e68ee19-3f62-5f74-bb37-3073d1fe7adb/scratchpad/xmas/holiday.mid")
print("beats", t + 6, "seconds", (t + 6) * 60 / BPM)
