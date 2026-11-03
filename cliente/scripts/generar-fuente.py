"""
Genera una fuente bitmap (PNG + XML BMFont) para Phaser a partir de un .ttf/.otf, sin suavizado.
Uso: python scripts/generar-fuente.py <fuente.ttf|otf> <nombre> <tamano_px> [ajuste_y] [size_xml]
Salida: public/arte/ui/fuente_<nombre>.png y .xml. Requiere Pillow.

El XML declara size=8 (por defecto) como fuente_pixel: letras() pide fontSize 8*k y Phaser escala k veces (entero, sin borrosidad).
Los glifos que la fuente no trae (Ω, ω, ×, ·, flechas) se copian de fuente_pixel.png, alineados a la línea base.
"""
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ruta, nombre, tam = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
ajuste = int(sys.argv[4]) if len(sys.argv) > 4 else 0
size_xml = int(sys.argv[5]) if len(sys.argv) > 5 else 8  # Phaser escala 8*k / size_xml: elige size_xml para que sea entero
ui = Path(__file__).resolve().parent.parent / "public/arte/ui"

viejo_xml = (ui / "fuente_pixel.xml").read_text(encoding="utf-8")
ids = [int(x) for x in re.findall(r'<char id="(\d+)"', viejo_xml)]
viejo_png = Image.open(ui / "fuente_pixel.png").convert("RGBA")
viejos = {int(m[0]): tuple(int(v) for v in m[1:]) for m in re.findall(r'<char id="(\d+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"', viejo_xml)}
base_vieja = 7
PROPIOS = {937, 969, 215, 183, 8593, 8595}  # Ω ω × · ↑ ↓: ninguna de las fuentes nuevas los trae

font = ImageFont.truetype(str(ruta), tam)
asc, desc = font.getmetrics()
base = asc + ajuste
alto = asc + desc + ajuste

glifos = []  # (id, imagen, xoffset, yoffset, xadvance)
for cp in ids:
    ch = chr(cp)
    if cp in PROPIOS:
        x, y, w, h = viejos[cp]
        img = viejo_png.crop((x, y, x + w, y + h))
        glifos.append((cp, img, 0, base - base_vieja, w + 1))
        continue
    adv = round(font.getlength(ch))
    if cp == 32:
        glifos.append((cp, Image.new("RGBA", (0, 0)), 0, 0, max(adv, 3)))
        continue
    capa = Image.new("L", (tam * 3, tam * 3), 0)
    d = ImageDraw.Draw(capa); d.fontmode = "1"
    d.text((tam, tam * 2), ch, font=font, fill=255, anchor="ls")  # ls = izquierda + línea base
    caja = capa.getbbox()
    if caja is None:
        glifos.append((cp, Image.new("RGBA", (0, 0)), 0, 0, max(adv, 1)))
        continue
    recorte = capa.crop(caja)
    img = Image.new("RGBA", recorte.size, (255, 255, 255, 0))
    img.putalpha(recorte)
    glifos.append((cp, img, caja[0] - tam, base + (caja[1] - tam * 2) + 0, max(adv, caja[2] - tam)))

# tira horizontal con 1 px de separación
ancho = sum(g[1].width + 1 for g in glifos)
alto_atlas = max(g[1].height for g in glifos)
atlas = Image.new("RGBA", (ancho, alto_atlas), (0, 0, 0, 0))
filas, x = [], 0
for cp, img, xo, yo, adv in glifos:
    atlas.paste(img, (x, 0))
    filas.append(f'  <char id="{cp}" x="{x}" y="0" width="{img.width}" height="{img.height}" xoffset="{xo}" yoffset="{yo}" xadvance="{adv}" page="0"/>')
    x += img.width + 1
atlas.save(ui / f"fuente_{nombre}.png")
(ui / f"fuente_{nombre}.xml").write_text(
    '<?xml version="1.0"?>\n<font>\n'
    f' <info face="{nombre}" size="{size_xml}"/>\n'
    f' <common lineHeight="{alto + 1}" base="{base}" scaleW="{ancho}" scaleH="{alto_atlas}" pages="1"/>\n'
    f' <pages><page id="0" file="fuente_{nombre}.png"/></pages>\n'
    f' <chars count="{len(filas)}">\n' + "\n".join(filas) + "\n </chars>\n</font>\n", encoding="utf-8")
print(f"fuente_{nombre}: {len(filas)} glifos, atlas {ancho}x{alto_atlas}, lineHeight {alto + 1}, base {base}")
