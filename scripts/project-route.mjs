#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv.includes('--kind')?process.argv[process.argv.indexOf('--kind')+1]:null;
const d=JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/project-routes.json','utf8'));
if(!p){for(const r of d.routes) console.log(r.id+' — '+r.when);process.exit(0);} 
const r=d.routes.find(x=>x.id===p); if(!r){console.error('unknown route: '+p);process.exit(1);} console.log(JSON.stringify(r,null,2));
