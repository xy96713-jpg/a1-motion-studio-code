import path from 'node:path'; import fs from 'node:fs';
import { codexImage } from '../work/recipe-board-v1/style-lab/engine/blender/ref.mjs';
const root=process.cwd(); const src=path.join(root,'work/recipe-board-v1/style-lab/banana-3d/gen/clone-shelf.png'); const dir=path.join(root,'work/recipe-board-v1/projects/banana-design/materials/hero-views'); fs.mkdirSync(dir,{recursive:true});
const common='Same exact banana shelf world as the attached image: identical shelf geometry, banana bunches, yellow strip lights, floor, black negative space. Only move the camera; do not redesign the scene. No text, no logos, no people, no collage. 16:9 cinematic still.';
const views=[
 ['view-front-right','Camera moved to front-right three-quarter, looking down the shelf from the right side; keep foreground bunch and empty slot; right edge falls to black. '+common],
 ['view-right','Camera moved to a right-side profile along the shelf aisle, showing shelf depth and banana rows; black on the far right. '+common],
 ['view-top','High three-quarter top view of the same shelf, looking slightly down along the rows; foreground bunch and empty slot visible, black negative space on one side. '+common]
];
for(const [name,add] of views){const out=path.join(dir,name+'.png'); try{codexImage({out,request:add,from:src,receipt:{kind:'scene-view',view:name,source:'clone-shelf.png'}}); console.log('OK',out);}catch(e){console.error('FAIL',name,e.message)}}
