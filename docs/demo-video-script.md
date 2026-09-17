# DealSignals homepage demo video — recording script

Target: **45 seconds**, no audio, no cuts to camera. Screen only.
It plays muted, autoplaying, on loop in the `#demo` band on the homepage, so it
has to read with the sound off and it has to be worth watching twice.

The section is already live in the code. Until `public/videos/dealsignals-demo.mp4`
exists, the band falls back to the poster still, so nothing looks broken.

---

## Before you hit record

- Browser at **1920 x 1080** (16:9 — the frame on the page is 16:9), zoom 100%, no bookmarks bar, no extensions visible.
- Use a **real OM you have rights to show**. Greenfield Shopping Center or Hales
  Corners Plaza are already public on the site, so either is safe.
- Log in first. Nobody wants to watch a login.
- Clear the DealBoard down to 2-3 deals so the board does not look empty or messy.
- Hide the cursor jitter: move deliberately, in straight lines, and pause a full
  beat before each click.
- Turn off notifications (macOS Focus mode).

---

## Shot list

Timestamps map to the `CHAPTERS` array in
`src/components/marketing/ProductDemo.tsx`. If your cut lands differently,
change the `at` values there rather than re-recording.

### 01 — Drop the OM · 0:00-0:08
Start on the DealSignals upload screen, already scrolled so the drop zone fills
the frame. Drag the OM PDF in from the desktop. Let the file name appear.
**The point:** it takes one gesture, not a form.

### 02 — AI extraction · 0:08-0:22
Hold on the extraction state. Do not cut away. Let the viewer see fields
populate: price, NOI, cap rate, SF, tenants. If your extraction runs faster than
14 seconds, that is a good problem — hold the finished state a beat, then move on.
**The point:** it read the broker's PDF, unassisted.

### 03 — Score & verdict · 0:22-0:38
Scroll to the score. Let the number and the BUY/NEUTRAL/PASS verdict sit on
screen for 2 full seconds before anything moves. Then scroll slowly through the
signals and the sensitivity table.
**The point:** it has an opinion, not just a summary. This is the money shot.

### 04 — Rent roll + share · 0:38-0:45
Scroll to the rent roll, then click through to the shareable deal page. End on
that page, held still for the last 2 seconds so the loop restart is not jarring.
**The point:** the output is something you send to a partner, not a scratch pad.

---

## Loop hygiene

The video loops. The last frame and the first frame should not fight each other.
Two options, easiest first:

1. End on a calm, mostly-static screen (the shared deal page) and let the cut
   back to the upload screen read as a reset.
2. Add a 0.4s fade to black at the tail in Premiere.

---

## Export

Export from Premiere as H.264, 1920x1080, no audio track.
Save it anywhere, then compress with the command below.

Compress to a web-safe file (target under 6 MB — this autoplays on every
homepage visit, so size is a real cost):

```bash
ffmpeg -i "/Users/brody/Desktop/dealsignals-demo-raw.mp4" \
  -vf "scale=1600:-2" \
  -c:v libx264 -profile:v high -crf 26 -preset slow \
  -movflags +faststart -pix_fmt yuv420p -an \
  "/Users/brody/Library/CloudStorage/Dropbox/newbro (1)/hacktheprompt new/dealsignals/public/videos/dealsignals-demo.mp4"
```

Check the size:

```bash
ls -lh "/Users/brody/Library/CloudStorage/Dropbox/newbro (1)/hacktheprompt new/dealsignals/public/videos/dealsignals-demo.mp4"
```

If it comes out over 6 MB, raise `-crf 26` to `-crf 29` and run it again. Screen
recordings of flat UI compress extremely well, so you have room.

---

## Replace the poster frame

The current poster is built from `videos formarketing/static images DealSignals/screenshot for landing.png`.
Once the video exists, pull the poster from the video itself so the first painted
frame matches. Grab it from the verdict moment (0:24), not frame zero — the
poster is what people see before the video decodes, and the verdict sells better
than an empty upload box:

```bash
ffmpeg -y -ss 24 -i "/Users/brody/Library/CloudStorage/Dropbox/newbro (1)/hacktheprompt new/dealsignals/public/videos/dealsignals-demo.mp4" \
  -frames:v 1 -q:v 3 \
  "/Users/brody/Library/CloudStorage/Dropbox/newbro (1)/hacktheprompt new/dealsignals/public/videos/demo-poster.jpg"
```

---

## Preview it locally

```bash
cd "/Users/brody/Library/CloudStorage/Dropbox/newbro (1)/hacktheprompt new/dealsignals" && npm run dev
```

Then open `http://localhost:3000/#demo`.
