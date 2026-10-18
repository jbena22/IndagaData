import {validateProcessRequest} from '../src/core/process-request.mjs';

const REQUEST_HOUR_MS=3_600_000;
function requestJSON(value,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function boundedRequestText(request){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>8_192){await reader.cancel();return null;}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function receiveProcessRequest(request,env,{now=Date.now(),id=crypto.randomUUID()}={}){
 if(request.method!=='POST')return requestJSON({error:'Método no admitido.'},405);
 const origin=request.headers.get('origin');
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return requestJSON({error:'Origen no permitido.'},403);
 if(!env.DB)return requestJSON({error:'La recepción de solicitudes no está configurada. No se ha guardado ni enviado tu propuesta.'},503);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return requestJSON({error:'Se requiere JSON.'},415);
 if(Number(request.headers.get('content-length'))>8_192)return requestJSON({error:'Solicitud demasiado grande.'},413);
 let input;
 try{const text=await boundedRequestText(request);if(text===null)return requestJSON({error:'Solicitud demasiado grande.'},413);input=JSON.parse(text);}catch{return requestJSON({error:'Solicitud no válida.'},400);}
 const validation=validateProcessRequest(input);
 if(!validation.ok)return requestJSON({error:'Revisa los campos de la solicitud.',fields:validation.errors},422);
 const v=validation.values;
 try{
  // Admisión y escritura atómicas en la misma base, sin contadores en memoria.
  // No se guardan IPs. La cuota compartida permite 20 registros/hora y uno cada 15 s.
  const result=await env.DB.prepare(`INSERT INTO process_requests (id,created_at,name,problem,dataset,expected,email)
   SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM process_requests WHERE created_at>?)<20
   AND NOT EXISTS (SELECT 1 FROM process_requests WHERE created_at>?)`)
   .bind(id,now,v.name,v.problem,v.dataset,v.expected,v.email||null,now-REQUEST_HOUR_MS,now-15_000).run();
  if(result.success===false)throw new Error('Storage failed');
  if(result.meta?.changes!==1)return requestJSON({error:'Límite compartido: 20 solicitudes por hora y 15 segundos entre envíos. No se ha guardado tu solicitud; inténtalo más tarde.'},429);
  return requestJSON({id,receivedAt:new Date(now).toISOString(),message:'Solicitud recibida y guardada de forma privada. Conserva este identificador. No se ha enviado un correo automático.'},201);
 }catch{return requestJSON({error:'No se pudo confirmar la recepción. No se mostrará un envío exitoso; inténtalo más tarde.'},503);}
}
