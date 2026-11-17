"""Draws a concert's artwork for the site from its poster (needs Pillow).

  python3 scripts/event-art.py <poster file> <key> [--card cover|band|top] [--at 0.33]
                               [--to 1] [--crop x0,y0,x1,y1] [--wide <name>]

Writes assets/events/card/<key>.webp (800 x 1120, 5:7, the ticket card) and a 480 px copy.
With --wide, also assets/events/<name>.webp (1200 x 800, 3:2, the concert page and the stage
screens) and a 640 px copy; give a file that replaces another a new name, so browsers that
cached the old one fetch it.

How the poster goes on the card:
  cover  cropped to fill it: for a poster that is about 5:7 already.
  band   whole, full width, over a blurred copy of itself; --at is where its middle sits, as
         a share of the card's height (the card's date and logo take the top sixth, its
         name the part below the middle). --crop trims the poster first (shares of its size);
         the blurred copy behind it stays whole.
  top    full width from --at down to --to, fading out there: a tall poster whose title is
         at its top, its small print kept from under the card's name.
The 3:2 file shows the poster whole, over a blurred copy of itself if it has another shape.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'events')


def cover(im, w, h):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def backdrop(im, w, h):
    b = cover(im, w // 4, h // 4).filter(ImageFilter.GaussianBlur(10)).resize((w, h), Image.BICUBIC)
    b = b.filter(ImageFilter.GaussianBlur(6))
    return ImageEnhance.Brightness(ImageEnhance.Color(b).enhance(1.2)).enhance(0.62)


def soft(w, h, edges, f):
    """An alpha mask that fades the given edges (t, b, l, r) over f pixels."""
    m = Image.new('L', (w, h), 255)
    d = ImageDraw.Draw(m)
    for i in range(f):
        a = round(255 * (i + 0.5) / f)
        if 't' in edges: d.line([(0, i), (w, i)], fill=a)
        if 'b' in edges: d.line([(0, h - 1 - i), (w, h - 1 - i)], fill=a)
        if 'l' in edges: d.line([(i, 0), (i, h)], fill=a)
        if 'r' in edges: d.line([(w - 1 - i, 0), (w - 1 - i, h)], fill=a)
    return m


def draw(im, w, h, mode='band', at=0.5, bg=None, to=1.0):
    if mode == 'cover' or abs(im.width / im.height - w / h) < 0.02:
        return cover(im, w, h)
    out = backdrop(bg or im, w, h)
    if mode == 'top':
        y = round(h * at)
        art = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
        art = art.crop((0, 0, w, min(round(h * to) - y, art.height)))
        out.paste(art, (0, y), soft(w, art.height, 't' + ('b' if y + art.height < h else ''), 36 if to >= 1 else 90))
    elif im.width / im.height > w / h:
        bh = round(w * im.height / im.width)
        y = min(max(round(h * at - bh / 2), 0), h - bh)
        edges = ('t' if y > 0 else '') + ('b' if y + bh < h else '')
        out.paste(im.resize((w, bh), Image.LANCZOS), (0, y), soft(w, bh, edges, 36))
    else:
        bw = round(h * im.width / im.height)
        out.paste(im.resize((bw, h), Image.LANCZOS), ((w - bw) // 2, 0), soft(bw, h, 'lr', 28))
    return out


def save(im, path, small):
    im.save(f'{path}.webp', quality=82, method=6)
    im.resize((small, round(small * im.height / im.width)), Image.LANCZOS).save(f'{path}-{small}.webp', quality=80, method=6)


if __name__ == '__main__':
    a = argparse.ArgumentParser()
    a.add_argument('poster'); a.add_argument('key')
    a.add_argument('--card', choices=['cover', 'band', 'top'], default='band')
    a.add_argument('--at', type=float, default=0.33)
    a.add_argument('--to', type=float, default=1.0)
    a.add_argument('--crop'); a.add_argument('--wide')
    o = a.parse_args()
    im = Image.open(o.poster).convert('RGB')
    card = im
    if o.crop:
        x0, y0, x1, y1 = (float(v) for v in o.crop.split(','))
        card = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
    os.makedirs(os.path.join(OUT, 'card'), exist_ok=True)
    save(draw(card, 800, 1120, o.card, o.at, bg=im, to=o.to), os.path.join(OUT, 'card', o.key), 480)
    if o.wide:
        save(draw(im, 1200, 800), os.path.join(OUT, o.wide), 640)
