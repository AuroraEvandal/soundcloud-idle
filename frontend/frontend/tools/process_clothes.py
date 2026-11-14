#!/usr/bin/env python3
"""Превращает сырые картинки одежды (на зелёном фоне) в PNG-слои 512x1024 для гардероба.

Запуск:  python3 tools/process_clothes.py <папка_с_jpg> public/clothes
Нужно: Pillow, numpy, scipy.

Что делает: убирает зелёный фон и серые поля, чистит края, сводит палитру к 24 цветам,
масштабирует вещь под свою зону и ставит её на прозрачный холст 512x1024 по центру.
Размеры и положение каждой вещи правятся в таблице ITEMS ниже.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 512, 1024
COLORS = 24

# файл -> (имя выходного файла, как масштабировать, как привязать по вертикали)
#   fit:    ('w', px) вписать по ширине или ('h', px) по высоте
#   anchor: ('top', y) верх вещи на высоте y или ('bottom', y) низ вещи на высоте y
ITEMS = {
    'cap1': ('cap1', ('w', 225), ('top', 30)),
    'chain1': ('scarf1', ('h', 320), ('top', 215)),
    'hoodie1': ('hoodie1', ('w', 345), ('top', 245)),
    'hoodie2': ('coat1', ('h', 540), ('top', 235)),
    'hoodie3': ('hoodie3', ('h', 440), ('top', 240)),
    'jeans1': ('jeans1', ('h', 425), ('bottom', 985)),
    'jeans2': ('jeans2', ('h', 425), ('bottom', 985)),
    'shoes1': ('boots1', ('w', 274), ('bottom', 1015)),
    'shoes2': ('sneakers1', ('w', 274), ('bottom', 1015)),
}
MAX_H = {'boots1': 360, 'sneakers1': 220}


def trim_padding(a):
    """Срезает однотонные тёмно-серые поля по краям (если картинку дополнили до нужного размера)."""
    mx, mn = a.max(2), a.min(2)
    pad = (mx < 100) & (mx - mn < 14)
    def cut(axis_rows, reverse):
        n = 0
        rng = range(len(axis_rows) - 1, -1, -1) if reverse else range(len(axis_rows))
        for i in rng:
            if axis_rows[i] > 0.97:
                n += 1
            else:
                break
        return n
    rows, cols = pad.mean(1), pad.mean(0)
    t, b, l, r = cut(rows, False), cut(rows, True), cut(cols, False), cut(cols, True)
    return a[t:a.shape[0] - b, l:a.shape[1] - r]


def cutout(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    a = trim_padding(a)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (g > 140) & (g - r > 60) & (g - b > 60)
    fg = ~bg
    fg = ndi.binary_opening(fg, iterations=1)           # убрать одиночные пятна
    fg = ndi.binary_erosion(fg, iterations=1)           # съесть зелёную кайму JPEG
    lab, n = ndi.label(fg)
    if n:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(150, sizes.max() * 0.002)]
        fg = np.isin(lab, keep)
    ys, xs = np.where(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, mask = a[y0:y1, x0:x1].astype(np.uint8), fg[y0:y1, x0:x1]
    # на месте фона берём цвет ближайшего пикселя вещи, чтобы зелёный не просочился при масштабировании
    idx = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    rgb = rgb[idx[0], idx[1]]
    # убрать зелёный оттенок на краях
    rr, gg, bb = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    over = gg > np.maximum(rr, bb) + 25
    gg = np.where(over, np.maximum(rr, bb) + 25, gg)
    rgb = np.stack([rr, gg, bb], -1).astype(np.uint8)
    return Image.fromarray(rgb), Image.fromarray((mask * 255).astype(np.uint8))


def place(img, mask, fit, anchor, max_h=None):
    kind, val = fit
    w0, h0 = img.size
    s = val / (w0 if kind == 'w' else h0)
    if max_h and h0 * s > max_h:
        s = max_h / h0
    nw, nh = max(1, round(w0 * s)), max(1, round(h0 * s))
    img = img.resize((nw, nh), Image.LANCZOS)
    mask = mask.resize((nw, nh), Image.LANCZOS).point(lambda v: 255 if v >= 128 else 0)
    # палитра 24 цвета по пикселям самой вещи, без дизеринга
    m = np.asarray(mask) > 0
    px = np.asarray(img)[m]
    sample = Image.fromarray(px.reshape(-1, 1, 3))
    pal = sample.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE)
    q = img.quantize(palette=pal, dither=Image.NONE).convert('RGB')
    out = q.convert('RGBA')
    out.putalpha(mask)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x = (W - nw) // 2
    y = anchor[1] if anchor[0] == 'top' else anchor[1] - nh
    canvas.alpha_composite(out, (x, max(0, y)))
    return canvas


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    for key, (name, fit, anchor) in ITEMS.items():
        f = next((os.path.join(src, x) for x in os.listdir(src) if x.lower().startswith(key + '.')), None)
        if not f:
            print('нет файла для', key)
            continue
        img, mask = cutout(f)
        out = place(img, mask, fit, anchor, MAX_H.get(name))
        out.save(os.path.join(dst, name + '.png'), optimize=True)
        # маленькая иконка для списков: вещь без пустого поля, вписана в 96x96
        box = out.getbbox()
        t = out.crop(box)
        k = min(96 / t.width, 96 / t.height)
        t = t.resize((max(1, round(t.width * k)), max(1, round(t.height * k))), Image.NEAREST)
        th = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        th.alpha_composite(t, ((96 - t.width) // 2, (96 - t.height) // 2))
        th.save(os.path.join(dst, name + '_thumb.png'), optimize=True)
        print('ok', name, out.getbbox())


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
