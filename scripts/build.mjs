import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
const assets={};
for(const [url,path,type] of [['/','src/index.html','text/html; charset=utf-8'],['/styles.css','src/styles.css','text/css; charset=utf-8'],['/ui.mjs','src/ui.mjs','text/javascript; charset=utf-8'],['/engine.mjs','src/engine.mjs','text/javascript; charset=utf-8'],['/report.mjs','src/report.mjs','text/javascript; charset=utf-8'],['/demo.csv','data/demo.csv','text/csv; charset=utf-8']]){
 if(existsSync(path))assets[url]={body:readFileSync(path,'utf8'),type};
}
for(const dir of ['core','processes'])for(const file of readdirSync('src/'+dir))assets['/'+dir+'/'+file]={body:readFileSync('src/'+dir+'/'+file,'utf8'),type:'text/javascript; charset=utf-8'};
const engine=['src/core/math.mjs','src/core/csv.mjs','src/processes/banking.mjs'].map(path=>readFileSync(path,'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')).join('\n');
const worker=readFileSync('worker/api.mjs','utf8');
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
writeFileSync('worker/index.js','// Generado por scripts/build.mjs. Editar src/ y worker/api.mjs.\n'+engine+'\nconst ASSETS='+JSON.stringify(assets)+';\n'+worker);
writeFileSync('dist/server/index.js',readFileSync('worker/index.js'));
writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
console.log('Worker construido: '+Object.keys(assets).length+' rutas, '+readFileSync('worker/index.js').length+' bytes.');
