# The ground of a region map: real elevation as a grey hillshade (the reference's B19 map of Gansu and Inner Mongolia is
# a desaturated satellite relief; this is the same reading from open data). Terrain tiles: AWS Open Data / Mapzen
# "terrarium" PNGs (height = R*256 + G + B/256 - 32768 m), fetched with curl, resampled onto the map plane's own
# projection (maps.mjs projectMap: lon/lat linear over the bbox), lit from the north-west.
#   python3 relief.py <map.json> <out.png> <tile cache dir> [<sea.png>]
# sea.png: white where the ground is at or under sea level (the terrarium heights carry the sea floor), black on land
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image

URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def main(map_file, out, cache, sea=None):
    m = json.load(open(map_file)); S, W, N, E = m['bbox']; w, h = m['w'], m['h']
    # a zoom at which the tiles give about a pixel per map pixel / 2
    z = max(1, min(11, round(math.log2(w / 2 / 256 / ((E - W) / 360)))))
    x0, y0 = tile_xy(W, N, z); x1, y1 = tile_xy(E, S, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    os.makedirs(cache, exist_ok=True)
    rows = []
    for ty in range(ty0, ty1 + 1):
        row = []
        for tx in range(tx0, tx1 + 1):
            f = os.path.join(cache, f'{z}-{tx}-{ty}.png')
            if not os.path.exists(f):
                subprocess.run(['curl', '-sS', '--max-time', '60', '-o', f, URL.format(z=z, x=tx, y=ty)], check=True)
            a = np.asarray(Image.open(f).convert('RGB'), dtype=np.float32)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
        rows.append(np.concatenate(row, axis=1))
    H = np.concatenate(rows, axis=0)
    # each map pixel's lon/lat -> the mosaic's pixel (nearest; the shading blurs it anyway)
    lon = W + (np.arange(w) + 0.5) / w * (E - W); lat = N - (np.arange(h) + 0.5) / h * (N - S)
    n = 2 ** z
    px = ((lon + 180) / 360 * n - tx0) * 256
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - ty0) * 256
    ix = np.clip(px.astype(int), 0, H.shape[1] - 1); iy = np.clip(py.astype(int), 0, H.shape[0] - 1)
    Z = H[iy[:, None], ix[None, :]]
    # hillshade: metres per map pixel, sun at azimuth 315, altitude 40, heights exaggerated for the flat steppe
    mx = (E - W) * 111320 * math.cos(math.radians((S + N) / 2)) / w; my = (N - S) * 110540 / h
    gy, gx = np.gradient(Z * 3.0, my, mx)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(40)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(shade, 0, 1)
    # water and lowland a touch darker, then a soft contrast (the reference's grey, not a postcard)
    low = np.clip((Z - Z.min()) / max(1, np.percentile(Z, 98) - Z.min()), 0, 1)
    v = 0.62 * shade + 0.38 * (0.35 + 0.65 * low)
    v = np.clip((v - 0.25) / 0.6, 0, 1) ** 1.1
    Image.fromarray((v * 255).astype(np.uint8), 'L').save(out)
    if sea: Image.fromarray(((Z <= 0.5) * 255).astype(np.uint8), 'L').save(sea)
    # and the land's height itself (height.png beside it, 0 at sea level to white at the box's 99th percentile): a lit map
    # takes it as its bump, so a light raking across shows the real relief (kit3 litMap)
    if sea:
        top = max(1.0, float(np.percentile(Z, 99)))
        Image.fromarray((np.clip(Z / top, 0, 1) ** 0.6 * 255).astype(np.uint8), 'L').save(sea.replace('sea.png', 'height.png'))
    print(json.dumps({'zoom': z, 'tiles': (tx1 - tx0 + 1) * (ty1 - ty0 + 1), 'out': out}))

if __name__ == '__main__':
    main(*sys.argv[1:5])
