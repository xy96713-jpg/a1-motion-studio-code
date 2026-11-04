#!/usr/bin/env python3
"""Render a text-free, equirectangular land map from a GeoJSON source.

The caller supplies the bounds and palette. This is geographic data, not a generated image
or a representation of a particular disease, crop area, route, or boundary.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw


def render(source, destination, bounds, size, sea, land, coast):
    west, east, south, north = bounds
    width, height = size
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90 and width > 0 and height > 0):
        raise ValueError('invalid map bounds or dimensions')
    data = json.loads(Path(source).read_text())
    canvas = Image.new('RGB', (width, height), sea)
    draw = ImageDraw.Draw(canvas)
    def point(p):
        return ((p[0]-west)/(east-west)*width, (north-p[1])/(north-south)*height)
    for feature in data['features']:
        geometry = feature['geometry']
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else []
        for polygon in polygons:
            for index, ring in enumerate(polygon):
                if len(ring) < 3: continue
                xy = [point(p) for p in ring]
                draw.polygon(xy, fill=land if index == 0 else sea)
                draw.line(xy, fill=coast, width=2, joint='curve')
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--bounds', nargs=4, type=float, required=True, metavar=('WEST','EAST','SOUTH','NORTH'))
    p.add_argument('--size', nargs=2, type=int, default=[1100, 760], metavar=('WIDTH','HEIGHT'))
    p.add_argument('--sea', default='#121730')
    p.add_argument('--land', default='#3d4b6a')
    p.add_argument('--coast', default='#9aaec5')
    a = p.parse_args()
    render(a.source, a.output, a.bounds, a.size, a.sea, a.land, a.coast)

if __name__ == '__main__': main()
