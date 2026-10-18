import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
import {receiveProcessRequest} from '../worker/requests.mjs';

const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
const migrations=journal.entries.map(entry=>({tag:entry.tag,sql:readFileSync('drizzle/'+entry.tag+'.sql','utf8')}));
test('D1 usa DB nativo y empaqueta migraciones y metadatos generados, sin otro almacenamiento',()=>{
 assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,null);
 assert.deepEqual(JSON.parse(readFileSync('dist/.openai/hosting.json','utf8')),manifest);
 assert.equal(journal.dialect,'sqlite');assert.equal(journal.entries.length,1);
 for(const file of readdirSync('drizzle'))if(file.endsWith('.sql'))assert.equal(readFileSync('dist/.openai/drizzle/'+file,'utf8'),readFileSync('drizzle/'+file,'utf8'));
 for(const file of readdirSync('drizzle/meta'))assert.equal(readFileSync('dist/.openai/drizzle/meta/'+file,'utf8'),readFileSync('drizzle/meta/'+file,'utf8'));
});
test('migración alojada solo crea esquema; coincide con el contrato local y no necesita inicializador HTTP',()=>{
 const generated=new DatabaseSync(':memory:'),local=new DatabaseSync(':memory:');
 try{
  for(const {sql}of migrations){assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);generated.exec(sql);}
  local.exec(readFileSync('db/0000_process_requests.sql','utf8'));
  assert.deepEqual(generated.prepare('PRAGMA table_info(process_requests)').all(),local.prepare('PRAGMA table_info(process_requests)').all());
  assert.deepEqual(generated.prepare('PRAGMA index_list(process_requests)').all(),local.prepare('PRAGMA index_list(process_requests)').all());
  assert.equal(generated.prepare('SELECT COUNT(*) AS n FROM process_requests').get().n,0);
 }finally{generated.close();local.close();}
});
test('cualquier visitante anónimo puede enviar, sin cookies ni cabeceras de identidad',async()=>{
 const sqlite=new DatabaseSync(':memory:');for(const {sql}of migrations)sqlite.exec(sql);
 const DB={prepare(sql){return {bind(...values){return {async run(){return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}};}};
 try{
  const response=await worker.fetch(new Request('https://indagadata.test/api/process-requests',{method:'POST',headers:{origin:'https://indagadata.test','content-type':'application/json'},body:JSON.stringify({name:'Proceso de prueba',problem:'Comprobar envío público sin registro.',dataset:'CSV con fecha e importes sintéticos.',expected:'Confirmación real del guardado privado.'})}),{DB});
  assert.equal(response.status,201);const receipt=await response.json();
  assert.equal(sqlite.prepare('SELECT id FROM process_requests').get().id,receipt.id);
  assert.deepEqual(Object.keys(receipt).sort(),['id','message','receivedAt']);
 }finally{sqlite.close();}
});
test('no hay API de lectura pública aunque se envíen identidad falsa, ID, filtros o petición de exportación',async()=>{
 let reads=0;const DB={prepare(){reads++;throw new Error('No debe leerse la base desde la web');}};
 const paths=['/api/process-requests','/api/process-requests?id=private-test&download=csv','/api/process-requests/private-test','/api/admin/requests','/admin','/.openai/drizzle/meta/_journal.json','/.openai/hosting.json','/drizzle/0000_heavy_war_machine.sql','/.sites-local/process-requests.sqlite'];
 for(const path of paths)for(const method of ['GET','HEAD']){
  const response=await worker.fetch(new Request('https://indagadata.test'+path,{method,headers:{'oai-authenticated-user-id':'forged-owner','oai-authenticated-user-email':'forged@example.invalid'}}),{DB});
  assert.ok([404,405].includes(response.status),path+' '+method);
  assert.doesNotMatch(await response.text(),/private-test|forged@example|SELECT|process_requests/);
 }
 const status=await worker.fetch(new Request('https://indagadata.test/api/process-requests/status'),{DB});
 assert.deepEqual(await status.json(),{available:true,receipt:'private-storage'});assert.equal(reads,0);
});
test('tabla ausente o binding inválido no confirman recepción ni intentan crear esquema desde HTTP',async()=>{
 const calls=[],DB={prepare(sql){calls.push(sql);return {bind(){return {run(){throw new Error('no such table: process_requests');}};}};}};
 const response=await receiveProcessRequest(new Request('https://indagadata.test/api/process-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Prueba de esquema',problem:'Verificación de tabla ausente.',dataset:'CSV de prueba sin datos reales.',expected:'Error controlado sin éxito aparente.'})}),{DB});
 assert.equal(response.status,503);assert.equal(calls.length,1);assert.doesNotMatch(calls[0],/\b(?:CREATE|ALTER|DROP)\b/);
 assert.doesNotMatch(await response.text(),/no such table/);
});
