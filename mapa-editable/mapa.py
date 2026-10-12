import json, math, unicodedata, sys, os
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geo')

def norm(s):
    s = s.replace('�', 'N')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').upper()

def load(f):
    raw = open(os.path.join(G, f), 'rb').read()
    try: txt = raw.decode('utf-8')
    except UnicodeDecodeError: txt = raw.decode('latin-1')
    return json.loads(txt)['features']

prov = load('departamentos-buenos_aires.json')
caba = load('caba.json')

ZONAS = {
  'capital': ('#FFD700', []),
  'gba1': ('#25D366', ['AVELLANEDA','GENERAL SAN MARTIN','HURLINGHAM','ITUZAINGO','LANUS','LOMAS DE ZAMORA','MORON','SAN FERNANDO','SAN ISIDRO','TRES DE FEBRERO','VICENTE LOPEZ']),
  'gba2': ('#777777', ['ALMIRANTE BROWN','BERAZATEGUI','ESTEBAN ECHEVERRIA','EZEIZA','FLORENCIO VARELA','JOSE C PAZ','MALVINAS ARGENTINAS','MERLO','MORENO','QUILMES','SAN MIGUEL','TIGRE']),
  'gba3': ('#E53935', ['BERISSO','CANUELAS','ENSENADA','ESCOBAR','GENERAL RODRIGUEZ','LA PLATA','MARCOS PAZ','PILAR','PRESIDENTE PERON','SAN VICENTE']),
}
ZONA_DE = {p: z for z, (_, ps) in ZONAS.items() for p in ps}

NOMBRES = {
 'ALMIRANTE BROWN':'Almirante\nBrown','BERAZATEGUI':'Berazategui','ESTEBAN ECHEVERRIA':'Esteban\nEcheverría',
 'EZEIZA':'Ezeiza','FLORENCIO VARELA':'Florencio\nVarela','JOSE C PAZ':'José C.\nPaz','MALVINAS ARGENTINAS':'Malvinas\nArgentinas',
 'MERLO':'Merlo','MORENO':'Moreno','QUILMES':'Quilmes','SAN MIGUEL':'San\nMiguel','TIGRE':'Tigre',
 'AVELLANEDA':'Avellaneda','GENERAL SAN MARTIN':'San\nMartín','HURLINGHAM':'Hurlingham','ITUZAINGO':'Ituzaingó',
 'LANUS':'Lanús','LOMAS DE ZAMORA':'Lomas de\nZamora','MORON':'Morón','SAN FERNANDO':'San\nFernando','SAN ISIDRO':'San\nIsidro',
 'TRES DE FEBRERO':'3 de\nFebrero','VICENTE LOPEZ':'Vicente\nLópez',
 'BERISSO':'Berisso','CANUELAS':'Cañuelas','ENSENADA':'Ensenada','ESCOBAR':'Escobar','GENERAL RODRIGUEZ':'General\nRodríguez',
 'LA PLATA':'La Plata','MARCOS PAZ':'Marcos\nPaz','PILAR':'Pilar','PRESIDENTE PERON':'Pte. Perón\n(Guernica)','SAN VICENTE':'San\nVicente',
}

def rings_of(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    return geom['coordinates']

# ---- La Matanza split (half-plane through Isidro Casanova / Laferrere gap) ----
P0 = (-58.585, -34.725); N = (1.0, 1.0)
def side(p): return (p[0]-P0[0])*N[0] + (p[1]-P0[1])*N[1]
def clip(ring, keep_pos):
    out = []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i+1) % n]
        sa, sb = side(a), side(b)
        ina, inb = (sa >= 0) == keep_pos, (sb >= 0) == keep_pos
        if ina: out.append(a)
        if ina != inb:
            t = sa / (sa - sb)
            out.append((a[0] + t*(b[0]-a[0]), a[1] + t*(b[1]-a[1])))
    return out

shapes = []  # (key, zona, [polys of rings])
for f in prov:
    k = norm(f['properties']['departamento'])
    polys = rings_of(f['geometry'])
    if k == 'LA MATANZA':
        outer = max((p[0] for p in polys), key=len)
        shapes.append(('LA MATANZA N', 'gba1', [[clip(outer, True)]]))
        shapes.append(('LA MATANZA S', 'gba2', [[clip(outer, False)]]))
    else:
        shapes.append((k, ZONA_DE.get(k), polys))
caba_polys = [p for f in caba for p in rings_of(f['geometry'])]
shapes.append(('CABA', 'capital', caba_polys))
NOMBRES['LA MATANZA N'] = 'La Matanza\nNorte'; NOMBRES['LA MATANZA S'] = 'La Matanza\nSur'; NOMBRES['CABA'] = 'CAPITAL'

# ---- projection / view ----
LAT0 = -34.7
KX = math.cos(math.radians(LAT0))
LON_MIN, LON_MAX, LAT_MAX, LAT_MIN = -59.24, -57.74, -34.21, -35.32
W = 1600
S = W / ((LON_MAX - LON_MIN) * KX)
H = int((LAT_MAX - LAT_MIN) * S)
def proj(p): return ((p[0]-LON_MIN)*KX*S, (LAT_MAX-p[1])*S)

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0, 0
    for i in range(1, len(pts)-1):
        d = abs(dy*pts[i][0] - dx*pts[i][1] + b[0]*a[1] - b[1]*a[0]) / L
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return rdp(pts[:idx+1], eps)[:-1] + rdp(pts[idx:], eps)
    return [a, b]

def path_d(polys):
    out = []
    for poly in polys:
        for ring in poly:
            raw = [proj(p) for p in ring]
            m = len(raw) // 2
            pts = rdp(raw[:m+1], 0.6)[:-1] + rdp(raw[m:], 0.6)
            if len(pts) < 3: continue
            out.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z')
    return ''.join(out)

def centroid(polys):
    best = max((poly[0] for poly in polys), key=lambda r: abs(area(r)))
    pts = [proj(p) for p in best]
    A = cx = cy = 0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i+1) % len(pts)]
        c = x0*y1 - x1*y0; A += c; cx += (x0+x1)*c; cy += (y0+y1)*c
    A /= 2
    return cx/(6*A), cy/(6*A), abs(A)
def area(r):
    return sum(r[i][0]*r[(i+1)%len(r)][1] - r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r)))/2

# label nudges (px) and fixed sizes for crowded partidos
ABS = {'SAN FERNANDO': (-58.565, -34.452), 'TIGRE': (-58.64, -34.36), 'ESCOBAR': (-58.80, -34.36), 'ESTEBAN ECHEVERRIA': (-58.505, -34.83)}
NUDGE = { 'SAN ISIDRO': (0, 4), 'VICENTE LOPEZ': (4, 2),
         'LA MATANZA N': (-8, -6), 'LA MATANZA S': (0, -10), 'BERISSO': (-30, -10), 'ENSENADA': (-30, -25),
         'PILAR': (10, 0), 'CABA': (-22, -18), 'MORON': (0, 4), 'ITUZAINGO': (-4, 0), 'HURLINGHAM': (-2, 0)}
FS = {'VICENTE LOPEZ': 15, 'SAN ISIDRO': 15, 'SAN FERNANDO': 14, 'HURLINGHAM': 13, 'ITUZAINGO': 14, 'TRES DE FEBRERO': 15,
      'MORON': 17, 'GENERAL SAN MARTIN': 17, 'AVELLANEDA': 16, 'LANUS': 18, 'LOMAS DE ZAMORA': 17, 'CABA': 28,
      'LA MATANZA N': 16, 'JOSE C PAZ': 17, 'MALVINAS ARGENTINAS': 16, 'SAN MIGUEL': 18, 'ENSENADA': 17, 'BERISSO': 19, 'ESTEBAN ECHEVERRIA': 16}

paths_bg, paths_z, labels = [], [], []
for k, z, polys in shapes:
    d = path_d(polys)
    if not d: continue
    if z is None:
        paths_bg.append(f'<path d="{d}"/>')
        continue
    color = ZONAS[z][0]
    if k == 'CABA':
        caba_d = d
    else:
        paths_z.append(f'<path class="z {z}" fill="{color}" d="{d}"/>')
    cx, cy, A = centroid(polys)
    dx, dy = NUDGE.get(k, (0, 0)); cx += dx; cy += dy
    if k in ABS: cx, cy = proj(ABS[k])
    fs = FS.get(k, max(18, min(30, int(math.sqrt(A) / 8))))
    lines = NOMBRES[k].split('\n')
    lh = fs * 1.05
    y0 = cy - (len(lines)-1) * lh / 2
    tsp = ''.join(f'<tspan x="{cx:.1f}" y="{y0 + i*lh:.1f}">{t}</tspan>' for i, t in enumerate(lines))
    cls = 'lbl cap' if k == 'CABA' else 'lbl'
    labels.append(f'<text class="{cls}" font-size="{fs}" style="--h:{color}">{tsp}</text>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
 <pattern id="olas" width="46" height="22" patternUnits="userSpaceOnUse">
  <path d="M2 14c5-6 10-6 15 0s10 6 15 0" fill="none" stroke="#2A2A2A" stroke-width="2" stroke-linecap="round" opacity=".55"/>
 </pattern>
 <filter id="sombra" x="-10%" y="-10%" width="120%" height="120%">
  <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000000" flood-opacity=".6"/>
 </filter>
</defs>
<rect width="{W}" height="{H}" fill="#0D0D0D"/>
<rect width="{W}" height="{H}" fill="url(#olas)"/>
<g class="bg" fill="#1E1E1E" stroke="#2A2A2A" stroke-width="1.5" stroke-linejoin="round">{''.join(paths_bg)}</g>
<g filter="url(#sombra)" stroke="#0D0D0D" stroke-width="2.6" stroke-linejoin="round">{''.join(paths_z)}</g>
<path d="{caba_d}" fill="none" stroke="#0D0D0D" stroke-width="6" stroke-linejoin="round"/><path d="{caba_d}" fill="#FFD700" stroke="#FFD700" stroke-width="1.6" stroke-linejoin="round"/>
<g>{''.join(labels)}</g>
</svg>'''
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mapa-base.svg'), 'w', encoding='utf-8').write(svg)
print(W, H, len(svg))
