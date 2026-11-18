"""Draws the pictures the pass email shows (needs Pillow).

  python3 scripts/mail-art.py

Not every mail app shows WebP, so the email takes JPEG copies of the concert pictures: for
each 3:2 file in assets/events/ (the one js/media.js gives an event as its `src`), it writes
assets/mail/<same name>.jpg, 1200 px wide or as wide as the file, and removes copies whose
file has gone. Run it after adding or replacing a poster: scripts/worker-catalog.mjs gives a
concert's email its poster only when the copy is here.

assets/mail/atvents-logo.png is assets/brand/atvents-logo-web.svg drawn 420 px wide, as mail
apps do not show SVG. Draw it again if the logo changes.
"""
import glob, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC, OUT = os.path.join(ROOT, 'assets', 'events'), os.path.join(ROOT, 'assets', 'mail')

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = set()
    for f in sorted(glob.glob(os.path.join(SRC, '*.webp'))):
        name = os.path.splitext(os.path.basename(f))[0]
        if name.endswith('-640'):
            continue
        names.add(name)
        im = Image.open(f).convert('RGB')
        if im.width > 1200:
            im = im.resize((1200, round(1200 * im.height / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}.jpg'), quality=80, optimize=True, progressive=True)
    for f in glob.glob(os.path.join(OUT, '*.jpg')):
        if os.path.splitext(os.path.basename(f))[0] not in names:
            os.remove(f)
    print(f'{len(names)} pictures in assets/mail/')
