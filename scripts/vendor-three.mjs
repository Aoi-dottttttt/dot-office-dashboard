import {build} from 'esbuild';
import fs from 'node:fs';
const exports=['Scene','Group','Mesh','MeshStandardMaterial','MeshBasicMaterial','BoxGeometry','SphereGeometry','CylinderGeometry','TorusGeometry','TubeGeometry','CatmullRomCurve3','BufferGeometry','Float32BufferAttribute','Vector2','Vector3','Color','OrthographicCamera','WebGLRenderer','DirectionalLight','HemisphereLight','PlaneGeometry','Box3','Raycaster','MathUtils','ACESFilmicToneMapping','SRGBColorSpace','PCFShadowMap'];
await build({stdin:{contents:`export {${exports.join(',')}} from 'three'; export {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';`,resolveDir:process.cwd()},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',outfile:'public/vendor/three.js',legalComments:'eof'});
fs.copyFileSync('node_modules/three/LICENSE','public/vendor/three-LICENSE.txt');
console.log('Bundled self-hosted Three.js 0.186.1.');
