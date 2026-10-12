# Mapa de zonas de envío — fuente editable

El mapa `mapa-zonas-envio-NUEVO.png` no es un diseño de Canva: se genera con dos scripts de Python
a partir de los límites oficiales de los partidos (datos públicos del IGN, en `geo/`).

## Archivos
- `mapa.py` → dibuja el SVG del mapa (`mapa-base.svg`): zonas, colores, partidos y nombres.
- `armar.py` → arma `mapa.html` con el SVG + título, leyenda de precios, río, texto de Vía Cargo y marca.
- `geo/` → límites de los partidos de Buenos Aires y de CABA (GeoJSON).

## Qué cambiar para otra marca
1. **Colores de las zonas** → `mapa.py`, diccionario `ZONAS` (línea ~17): el primer valor de cada zona es el hex.
   También `armar.py`, bloque `<div class="ley">`: los `background` y `--c` de cada fila de la leyenda.
2. **Marca de agua** → `armar.py`, `<div class="marca">virtualshopbaires.com.ar</div>` (sacar o cambiar).
3. **Precios / nombres de zonas** → `armar.py`, mismas filas de la leyenda. Los partidos de cada zona están en `ZONAS` de `mapa.py`.
4. **Tipografías** → `armar.py` carga Fredoka + Nunito desde Google Fonts.

## Cómo generar el PNG
```bash
python mapa.py && python armar.py
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1600,1440 --force-device-scale-factor=1.5 --virtual-time-budget=6000 --screenshot="RUTA\\mapa-final.png" "file:///RUTA/mapa.html"
```
(`RUTA` = carpeta donde están los archivos; el PNG sale en 2400x2160.)

Solo necesita Python 3 (sin librerías extra) y Chrome.
