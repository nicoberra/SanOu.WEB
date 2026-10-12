import os
D = os.path.dirname(os.path.abspath(__file__))
svg = open(os.path.join(D, 'mapa-base.svg'), encoding='utf-8').read()
import re
H = re.search(r'height="(\d+)"', svg).group(1)
html = ('''<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@800;900&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:#0D0D0D}
#lienzo{position:relative;width:1600px;height:{H}px;overflow:hidden;font-family:Nunito,sans-serif}
#lienzo svg{display:block}
.lbl{font-family:Nunito,sans-serif;font-weight:900;fill:#fff;text-anchor:middle;dominant-baseline:middle;
  paint-order:stroke;stroke:rgba(0,0,0,.65);stroke-width:3.2px;stroke-linejoin:round;letter-spacing:.2px}
.lbl.cap{font-family:Fredoka,sans-serif;font-weight:700;letter-spacing:1px;fill:#0D0D0D;stroke:none}
.titulo{position:absolute;right:44px;top:40px;box-sizing:border-box;width:372px;background:#141414;border-radius:28px;padding:22px 30px 22px 26px;
  box-shadow:0 14px 34px rgba(0,0,0,.55);display:flex;gap:18px;align-items:center}
.titulo .ico{width:66px;height:66px;border-radius:20px;background:#2A2A2A;display:grid;place-items:center;font-size:38px}
.titulo h1{margin:0;font-family:Fredoka,sans-serif;font-weight:700;font-size:38px;color:#FFD700;line-height:1;white-space:nowrap}
.titulo p{margin:6px 0 0;font-weight:800;font-size:17px;color:#BBBBBB;white-space:nowrap}
.ley{position:absolute;right:44px;top:186px;box-sizing:border-box;width:372px;background:#141414;border-radius:28px;padding:22px 24px;
  box-shadow:0 14px 34px rgba(0,0,0,.55);display:grid;gap:12px;min-width:300px}
.ley h2{margin:0 0 2px;font-family:Fredoka,sans-serif;font-weight:600;font-size:22px;color:#FFFFFF}
.z{display:flex;align-items:center;justify-content:space-between;gap:18px;border-radius:18px;padding:12px 18px;color:#fff;
  font-family:Fredoka,sans-serif;font-weight:600;font-size:26px}
.z b{background:rgba(255,255,255,.95);border-radius:999px;padding:4px 14px;font-size:24px;font-weight:700;color:var(--c)}
.rio{position:absolute;font-family:Fredoka,sans-serif;font-weight:500;font-style:italic;color:#BBBBBB;font-size:34px;
  transform:rotate(-31deg);letter-spacing:3px;opacity:.9}
.via{position:absolute;left:46px;bottom:40px;background:#141414;border-radius:22px;padding:16px 22px;font-weight:800;font-size:20px;
  color:#FFFFFF;box-shadow:0 10px 26px rgba(0,0,0,.55);display:flex;gap:12px;align-items:center}
.via span{font-size:28px}
.marca{position:absolute;right:46px;bottom:40px;font-family:Fredoka,sans-serif;font-weight:600;font-size:22px;color:#FFD700;opacity:.95}
</style></head><body><div id="lienzo">
''' + svg + '''
<div class="titulo"><div class="ico">🚚</div><div><h1>Zonas de envío</h1><p>Capital y Gran Buenos Aires</p></div></div>
<div class="ley"><h2>Costo de envío</h2>
 <div class="z" style="background:#FFD700;--c:#0D0D0D;color:#0D0D0D">Capital <b>$5.500</b></div>
 <div class="z" style="background:#25D366;--c:#0D0D0D">GBA 1 <b>$7.000</b></div>
 <div class="z" style="background:#777777;--c:#0D0D0D">GBA 2 <b>$9.000</b></div>
 <div class="z" style="background:#E53935;--c:#E53935">GBA 3 <b>$15.000</b></div>
</div>
<div class="rio" style="left:1250px;top:590px">Río de la Plata</div>
<div class="via"><span>📦</span>Interior del país: envío por Vía Cargo</div>
<div class="marca">sanou.com.ar</div>
</div></body></html>''').replace('{H}', H)
open(os.path.join(D, 'mapa.html'), 'w', encoding='utf-8').write(html)
print('ok')
