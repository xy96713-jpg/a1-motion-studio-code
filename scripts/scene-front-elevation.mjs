import path from 'node:path';
import { codexImage } from '../work/recipe-board-v1/style-lab/engine/blender/ref.mjs';
const root=process.cwd(); const src=path.join(root,'work/recipe-board-v1/style-lab/banana-3d/gen/clone-shelf.png'); const outdir=path.join(root,'work/recipe-board-v1/projects/banana-design/materials/hero-views');
const out=path.join(outdir,'view-front-elevation.png');
codexImage({out,from:src,request:'The exact same banana shelf scene as the attached image, rebuilt as an orthographic front elevation. Camera dead-on in front of the shelf at eye level, no perspective convergence, no wide-angle distortion, no cinematic depth of field. Show the full shelf front: horizontal shelves, banana bunches, strip lights, empty slot, floor line. Keep the same yellow palette and black negative space. No text, no logos, no people, no collage, no split screen. 16:9 still.',receipt:{kind:'scene-view',view:'front-elevation',source:'clone-shelf.png'}}); console.log('OK',out);
