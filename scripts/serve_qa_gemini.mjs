// QA local optativa: registra solo selección, agregados y respuesta; nunca CSV o clave.
// No sustituye scripts/serve.mjs ni se utiliza para desplegar.
import http from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import worker from '../worker/index.js';
const env={...process.env};
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}
if(process.argv.includes('--confirm-free-tier'))env.GEMINI_FREE_TIER_CONFIRMED='true';
if(!env.GEMINI_API_KEY||env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw Error('QA requiere clave de entorno y modalidad gratuita confirmada.');
const dir=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13)??'evidence/validacion_integral_2026-10-16/consultas';
mkdirSync(dir,{recursive:true});const scope=new AsyncLocalStorage();let sequence=0;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const target=new URL(url);if(target.origin!=='https://generativelanguage.googleapis.com')return nativeFetch(url,init);
 const record=scope.getStore();if(!record)throw Error('No QA request scope.');
 record.provider={attempted:true,origin:target.origin,path:target.pathname,transport:'native fetch; real Google API'};
 record.sentToGoogle=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
 const start=Date.now();
 try{const response=await nativeFetch(url,init);record.provider.httpStatus=response.status;record.provider.elapsedMs=Date.now()-start;
  try{const data=await response.clone().json();record.provider.finishReason=data.candidates?.[0]?.finishReason??null;record.provider.modelVersion=data.modelVersion??null;record.provider.usage=data.usageMetadata??null;record.provider.errorStatus=data.error?.status??null;}catch{record.provider.invalidJSON=true;}
  return response;
 }catch(error){record.provider.networkError=error.name==='TimeoutError'?'TimeoutError':'connection_failed';throw error;}
};
const server=http.createServer(async(req,res)=>{
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>5_100_000){res.writeHead(413).end();return;}}
  let record=null;if(req.url==='/api/ask'){const parsed=JSON.parse(body);record={id:++sequence,dateBogota:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'medium'}).format(new Date()),request:{options:parsed.options,question:parsed.question,consent:parsed.consent,decodedCSVTextSHA256:createHash('sha256').update(parsed.csv).digest('hex')}};}
  await scope.run(record,async()=>{const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}:{})});const response=await worker.fetch(request,env,{});
   if(record){record.responseStatus=response.status;record.response=await response.clone().json();const output=JSON.stringify(record,null,2);if(output.includes(env.GEMINI_API_KEY))throw Error('Secret redaction guard: record not saved.');writeFileSync(dir+'/consulta_'+String(record.id).padStart(3,'0')+'.json',output,{flag:'wx'});}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
 }catch{res.writeHead(500).end('Error de QA local; revisar evidencia saneada.');}
});
server.listen(4173,'127.0.0.1',()=>console.log('QA local: http://127.0.0.1:4173 · Gemini real, clave oculta, sin despliegue.'));
