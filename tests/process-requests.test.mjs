import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {validateProcessRequest} from '../src/core/process-request.mjs';
import {receiveProcessRequest} from '../worker/requests.mjs';
import worker from '../worker/index.js';
import {openLocalRequestDB} from '../scripts/local-request-db.mjs';
import {mountRequestForm} from '../src/requests-ui.mjs';

const proposal={name:'Seguimiento de recaudo',problem:'Entender las variaciones del recaudo mensual.',dataset:'CSV con fecha, crédito y valor recaudado.',expected:'Comparación de periodos y contribuciones por segmento.',email:''};
const start=Date.parse('2026-10-17T22:00:00Z');
const request=(value=proposal,headers={})=>new Request('http://localhost/api/process-requests',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost',...headers},body:JSON.stringify(value)});
const submit=(DB,now=start,value=proposal)=>receiveProcessRequest(request(value),{DB},{now,id:randomUUID()});
test('validación compartida exige cuatro campos; correo es opcional y rechaza tamaños/tipos inválidos',()=>{
 assert.equal(validateProcessRequest(proposal).ok,true);assert.equal(validateProcessRequest({...proposal,email:'qa@example.invalid'}).ok,true);
 for(const change of [{name:''},{problem:'corto'},{dataset:44},{expected:'x'.repeat(2001)},{email:'invalid'},{email:44},{website:'spam'}])assert.equal(validateProcessRequest({...proposal,...change}).ok,false);
 assert.equal(validateProcessRequest(null).ok,false);assert.equal(validateProcessRequest([]).ok,false);
});
test('guardado SQL real conserva texto literal y correo opcional sin exponerlos en la respuesta',async()=>{
 const DB=openLocalRequestDB(':memory:');
 try{const response=await submit(DB,start,{...proposal,name:"Solicitud '); DROP TABLE process_requests; --",email:'qa@example.invalid'});
  assert.equal(response.status,201);const body=await response.json();assert.ok(body.id);assert.equal(body.receivedAt,new Date(start).toISOString());
  assert.equal(JSON.stringify(body).includes('qa@example.invalid'),false);assert.match(body.message,/No se ha enviado un correo/);
  assert.equal((await submit(DB,start+15000)).status,201);
 }finally{DB.close();}
});
test('persistencia real sobrevive al cierre y reapertura; la cuota también permanece',async()=>{
 mkdirSync('.sites-local',{recursive:true});const path='.sites-local/request-test-'+randomUUID()+'.sqlite';let DB=openLocalRequestDB(path);
 try{
  const response=await submit(DB);assert.equal(response.status,201);const {id}=await response.json();DB.close();DB=openLocalRequestDB(path);
  const read=new DatabaseSync(path,{readOnly:true});const rows=read.prepare('SELECT * FROM process_requests').all();read.close();
  assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].name,proposal.name);assert.equal(rows[0].email,null);
  assert.equal((await submit(DB,start+14999)).status,429);assert.equal((await submit(DB,start+15000)).status,201);
 }finally{DB.close();unlinkSync(path);}
});
test('admisión atómica limita concurrencia y 20 registros por hora sin depender de memoria',async()=>{
 const DB=openLocalRequestDB(':memory:');
 try{
  const responses=await Promise.all(Array.from({length:12},()=>submit(DB)));assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(responses.filter(r=>r.status===429).length,11);
  for(let i=1;i<20;i++)assert.equal((await submit(DB,start+i*15000)).status,201);
  assert.equal((await submit(DB,start+20*15000)).status,429);assert.equal((await submit(DB,start+3_600_000)).status,201);
 }finally{DB.close();}
});
test('sin receptor, escritura fallida, JSON inválido, origen ajeno y cuerpo excesivo nunca devuelven éxito',async()=>{
 assert.equal((await receiveProcessRequest(request(),{})).status,503);
 const broken={prepare(){throw new Error('private storage detail');}};
 const fail=await submit(broken);assert.equal(fail.status,503);assert.doesNotMatch(await fail.text(),/private storage detail/);
 const DB=openLocalRequestDB(':memory:');try{
  assert.equal((await receiveProcessRequest(request(proposal,{origin:'https://foreign.test'}),{DB})).status,403);
  assert.equal((await receiveProcessRequest(request(proposal,{'content-type':'text/plain'}),{DB})).status,415);
  assert.equal((await receiveProcessRequest(request({...proposal,name:''}),{DB})).status,422);
  assert.equal((await receiveProcessRequest(request({name:'x'.repeat(9000)}),{DB})).status,413);
  assert.equal((await receiveProcessRequest(new Request('http://localhost/api/process-requests',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),{DB})).status,400);
 }finally{DB.close();}
});
test('Worker no ofrece lecturas públicas de solicitudes, base, esquema ni archivos locales',async()=>{
 for(const path of ['/api/process-requests','.sites-local/process-requests.sqlite','/db/0000_process_requests.sql','/api/process-requests/anything']){
  const response=await worker.fetch(new Request('https://indagadata.test/'+path.replace(/^\//,'')),{});assert.ok([404,405].includes(response.status),path);
 }
 const status=await worker.fetch(new Request('https://indagadata.test/api/process-requests/status'),{});assert.equal((await status.json()).available,false);
});
test('cuerpo sin Content-Length se corta a 8 KiB y no escribe; UTF-8 inválido se rechaza',async()=>{
 let cancelled=false;
 const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8193));},cancel(){cancelled=true;}});
 const DB={prepare(){throw new Error('No debe escribir');}};
 const large=new Request('http://localhost/api/process-requests',{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
 assert.equal((await receiveProcessRequest(large,{DB})).status,413);assert.equal(cancelled,true);
 const invalid=new Request('http://localhost/api/process-requests',{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array([0xff])});
 assert.equal((await receiveProcessRequest(invalid,{DB})).status,400);
});

function formHarness(fetcher){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,textContent:'',handlers:{},addEventListener(event,handler){this.handlers[event]=handler;},reset(){for(const [key,element]of nodes)if(key.startsWith('request-'))element.value='';}});return nodes.get(id);};
 const {ready}=mountRequestForm({getElementById:node},fetcher);
 const fill=value=>{for(const [key,text]of Object.entries(value))node('request-'+key).value=text;};
 const send=()=>node('process-request-form').handlers.submit({preventDefault(){}});
 return {node,ready,fill,send};
}
test('formulario real ejecuta POST, recibe confirmación del SQL y limpia campos solo tras HTTP 201',async()=>{
 const DB=openLocalRequestDB(':memory:');let posted=0;
 try{const ui=formHarness(async(url,options)=>{if(url.endsWith('/status'))return Response.json({available:true});posted++;return receiveProcessRequest(request(JSON.parse(options.body)),{DB},{now:start,id:randomUUID()});});await ui.ready;
  ui.fill({...proposal,website:''});await ui.send();assert.equal(posted,1);assert.match(ui.node('request-message').textContent,/Solicitud recibida.*ID:/);assert.equal(ui.node('request-name').value,'');assert.equal(ui.node('request-submit').disabled,false);
 }finally{DB.close();}
});
test('formulario no finge guardado si receptor falta, cuota falla, transporte expira o respuesta es ambigua',async()=>{
 const absent=formHarness(async()=>Response.json({available:false}));await absent.ready;assert.equal(absent.node('request-submit').disabled,true);assert.match(absent.node('request-availability').textContent,/no puede enviar ni guardar/);
 for(const action of [()=>Response.json({error:'Cuota agotada'}, {status:429}),()=>Response.json({message:'ok'}),()=>{throw new DOMException('Tiempo agotado','TimeoutError');},()=>{throw new TypeError('Conexión fallida');}]){
  const ui=formHarness(async(url)=>url.endsWith('/status')?Response.json({available:true}):action());await ui.ready;ui.fill({...proposal,website:''});await ui.send();assert.equal(ui.node('request-name').value,proposal.name);assert.doesNotMatch(ui.node('request-message').textContent,/Solicitud recibida/);assert.equal(ui.node('request-submit').disabled,false);
 }
});
test('validación de formulario bloquea envío y evita solicitudes dobles mientras guarda',async()=>{
 let finish,calls=0;const pending=new Promise(resolve=>finish=resolve);
 const ui=formHarness(async url=>{if(url.endsWith('/status'))return Response.json({available:true});calls++;return pending;});await ui.ready;ui.fill({...proposal,name:'',website:''});await ui.send();assert.equal(calls,0);assert.match(ui.node('request-message').textContent,/Nombre/);
 ui.fill(proposal);const saving=ui.send();assert.equal(ui.node('request-submit').disabled,true);await ui.send();assert.equal(calls,1);finish(Response.json({id:'receipt-test',receivedAt:new Date(start).toISOString(),message:'Solicitud recibida.'},{status:201}));await saving;
});
