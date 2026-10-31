"""Bake PWA icons from the splash ship mark (public/index.html #splashShip).
Run: python3 tools/bake-pwa-icons.py  (needs Pillow)"""
from PIL import Image, ImageDraw
BG, WAVE = (11, 61, 92), (43, 95, 138)
SHIP = [('r', (62, 14, 84, 30), '#DCE6EF'), ('r', (68, 6, 74, 15), '#E8833A'),
        ('r', (22, 22, 34, 30), '#5FA8D3'), ('r', (36, 22, 48, 30), '#E8833A'),
        ('r', (50, 22, 60, 30), '#5FA8D3'),
        ('p', [(4, 30), (116, 30), (104, 48), (14, 48)], '#F2F6FA'),
        ('p', [(10, 40), (110, 40), (104, 48), (14, 48)], '#C0392B')]
def bake(size, scale, out):
    S = 4; n = size * S
    im = Image.new('RGB', (n, n), BG); d = ImageDraw.Draw(im)
    w = n * scale; k = w / 120; ox = (n - w) / 2; oy = n * 0.5 - 30 * k
    for kind, g, c in SHIP:
        if kind == 'r':
            d.rectangle([ox + g[0]*k, oy + g[1]*k, ox + g[2]*k, oy + g[3]*k], fill=c)
        else:
            d.polygon([(ox + x*k, oy + y*k) for x, y in g], fill=c)
    wy = oy + 48 * k
    d.rectangle([0, wy, n, n], fill=WAVE)
    im.resize((size, size), Image.LANCZOS).save(out, optimize=True)
bake(192, 0.78, 'public/icon-192.png')
bake(512, 0.78, 'public/icon-512.png')
bake(512, 0.58, 'public/icon-maskable-512.png')  # inside 80% safe zone
bake(180, 0.78, 'public/apple-touch-icon.png')
