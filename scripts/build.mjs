import fs from 'node:fs';
import path from 'node:path';
import {validSnapshot} from '../worker/validate.js';
const initialSnapshot = JSON.parse(fs.readFileSync('initial-snapshot.json','utf8'));
if (!validSnapshot(initialSnapshot)) throw new Error('Invalid initial snapshot');
await import('./vendor-three.mjs');
const assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.avif':'image/avif','.txt':'text/plain; charset=utf-8'};
function addAssets(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Asset symlinks are not allowed');if(entry.isDirectory()){addAssets(file);continue;}const ext=path.extname(file);if(!types[ext])continue;const binary=['.webp','.png','.jpg','.avif'].includes(ext);assets['/'+path.relative('public',file).split(path.sep).join('/')]={body:fs.readFileSync(file,binary?'base64':'utf8'),type:types[ext],...(binary?{encoding:'base64'}:{})};}}
addAssets('public');
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/server',{recursive:true});
for(const name of ['index.js','storage.js','validate.js','authorization.js'])fs.copyFileSync('worker/'+name,'dist/server/'+name);
fs.writeFileSync('dist/server/assets.js','export const assets='+JSON.stringify(assets)+';\nexport const initialSnapshot='+JSON.stringify(initialSnapshot)+';\n');

console.log('Built dashboard: fictional demo by default, private API requires an authorization adapter.');
