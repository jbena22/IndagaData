// Prueba REAL opcional. Nunca imprime la clave ni persiste variables de entorno.
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {askGemini,geminiEvidence} from '../worker/index.js';
import {validateCSV,analyse} from '../src/engine.mjs';
const env={...process.env};
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}
const confirmed=env.GEMINI_FREE_TIER_CONFIRMED==='true'||process.argv.includes('--confirm-free-tier');
const csv=readFileSync('data/demo.csv','utf8'),validated=validateCSV(csv);
if(!validated.ok)throw Error('El ejemplo no supera la validación.');
const options={from:'2025-11-30',to:'2025-12-31',metric:'SALDO_TOTAL',dimension:'PRODUCTO',filters:{}};
const expected=analyse(validated.rows,options);
const question='Entre noviembre y diciembre de 2025, ¿cuánto cambió el saldo total y qué producto aporta más por magnitud? Expresa los importes en COP y la contribución neta en porcentaje; cita los campos usados. Distingue hechos observados de causas que este CSV no permite demostrar.';
let provider={attempted:false},elapsedMs=0;
const safeText=value=>String(value).replaceAll(env.GEMINI_API_KEY??'\u0000','[REDACTED]');
const start=Date.now();
const request=new Request('http://127.0.0.1:4173/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csv,options,question,consent:true})});
// Wrapper de observación: TODAS las llamadas se envían a fetch nativo, sin mocks.
const realTransport=async(url,init)=>{
 provider={attempted:true,model:new URL(url).pathname.split('/').at(-1).split(':')[0],timeoutConfigured:!!init.signal};
 try{const response=await fetch(url,init);provider.httpStatus=response.status;provider.contentType=response.headers.get('content-type');
  if(!response.ok){try{const failure=await response.clone().json();provider.errorStatus=failure.error?.status??null;provider.errorMessage=safeText(failure.error?.message??'');}catch{provider.errorBody='non_json';}}
  return response;}
 catch(error){provider.networkError=['ENOTFOUND','EAI_AGAIN','ECONNRESET','ETIMEDOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.cause?.code)?error.cause.code:error.name==='TimeoutError'?'TimeoutError':'connection_failed';throw error;}
};
const response=await askGemini(request,{...env,GEMINI_FREE_TIER_CONFIRMED:confirmed?'true':'false'},realTransport);
elapsedMs=Date.now()-start;const data=await response.json();
const report={verifiedAtBogota:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'medium'}).format(new Date()),transport:'native fetch to actual Gemini API; no mock',keyPresent:!!env.GEMINI_API_KEY,freeTierConfirmedForThisRun:confirmed,configurationPersisted:false,provider,elapsedMs,apiStatus:response.status,question,options,sourceSHA256:createHash('sha256').update(Buffer.from(csv)).digest('hex'),expectedCOP:{balance:expected.current.SALDO_TOTAL/100,delta:expected.delta/100,largestSegment:expected.contributions[0].segment,largestContribution:expected.contributions[0].delta/100,netContributionPct:expected.contributions[0].netContribution*100},evidenceMatchesEngine:response.ok?JSON.stringify(data.evidence)===JSON.stringify(geminiEvidence(expected)):null,answer:data.answer?safeText(data.answer):null,error:data.error?safeText(data.error):null,semanticReview:'A successful response still requires checking each figure and claim against deterministic evidence.',actualQuotaExhaustionTested:provider.httpStatus===429,artificialQuotaExhaustionAttempted:false,deploymentPerformed:false};
const out=process.argv.find(a=>a.startsWith('--output='))?.slice(9)??'evidence/gemini_real_2026-10-15.json';
if(existsSync(out))throw Error('La evidencia ya existe; usa otro --output para conservarla.');
mkdirSync(out.replace(/[\\/][^\\/]*$/,''),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!response.ok)process.exitCode=2;
