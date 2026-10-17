import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{askGemini as askWithQuota,geminiEvidence,createQuotaLimiter} from '../worker/index.js';
import {analyse,validateCSV,METRICS} from '../src/engine.mjs';
import {readFileSync} from 'node:fs';
// Las pruebas de transporte tienen presupuestos independientes. El alcance
// real del contador y sus límites se comprueban en public-quota.test.mjs.
const askGemini=(request,env,fetcher)=>askWithQuota(request,env,fetcher,createQuotaLimiter());
const env={GEMINI_API_KEY:'fake-test-key',GEMINI_FREE_TIER_CONFIRMED:'true'};
let id=0;const request=(extra={})=>new Request('https://indagadata.test/api/ask',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':String(++id)},body:JSON.stringify({csv:readFileSync('data/demo.csv','utf8'),question:'¿Qué cambió?',consent:true,options:{},...extra})});
test('no Gemini configuration leaves core routes functional',async()=>{const response=await worker.fetch(new Request('https://indagadata.test/'),{});assert.equal(response.status,200);const res=await askGemini(request(),{});assert.equal(res.status,503);});
test('explicit free-tier declaration and consent required',async()=>{assert.equal((await askGemini(request(),{GEMINI_API_KEY:'fake'})).status,503);assert.equal((await askGemini(request({consent:false}),env)).status,400);});
test('untrusted evidence never sent; recalculated aggregates exclude IDs and incomes',async()=>{let payload;const res=await askGemini(request({evidence:{SALDO_TOTAL:999}}),env,async(url,opts)=>{assert.ok(url.includes('gemini-3.5-flash-lite'));payload=JSON.parse(opts.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Respuesta de prueba.'}]}}]}));});assert.equal(res.status,200);const text=payload.contents[0].parts[0].text;assert.ok(!text.includes('ID_CREDITO'));assert.ok(!text.includes('ID_CLIENTE'));assert.ok(!text.includes('INGRESO_ANUAL_ESTIMADO'));assert.equal(JSON.parse(text).evidence.delta,'-715859081.00');});

test('Gemini receives exact COP across all money fields; ratios, counts and deterministic exports remain unchanged',()=>{
 const r=analyse(validateCSV(readFileSync('data/demo.csv','utf8')).rows),before=JSON.stringify(r),g=geminiEvidence(r);
 const amount=(actual,expected)=>{assert.match(actual,/^-?\d+\.\d{2}$/);assert.equal(BigInt(actual.replace('.','')),BigInt(expected));};
 for(const side of ['base','current']){for(const key of Object.keys(METRICS))amount(g[side][key],r[side][key]);for(const key of ['count','clients','provisionRate','arrearsRate','riskRate','coverage'])assert.equal(g[side][key],r[side][key]);}
 for(const key of ['delta','reconciliation'])amount(g[key],r[key]);
 r.contributions.forEach((v,i)=>{for(const key of ['base','current','delta'])amount(g.contributions[i][key],v[key]);assert.equal(g.contributions[i].netContribution,v.netContribution);assert.equal(g.contributions[i].baseCount,v.baseCount);});
 r.trend.forEach((v,i)=>{for(const key of Object.keys(METRICS))amount(g.trend[i][key],v[key]);});
 for(const key of Object.keys(METRICS))for(const side of ['base','current','delta'])amount(g.changes[key][side],r.changes[key][side]);
 for(const part of ['retained','entered','exited'])for(const key of ['base','current','delta'])amount(g.populationBridge[part][key],r.populationBridge[part][key]);
 for(const key of ['delta','reconciliation'])amount(g.populationBridge[key],r.populationBridge[key]);
 for(const key of ['base','current','delta','riskBase','riskCurrent','riskDelta','reconciliation','riskReconciliation'])amount(g.ratingMigrations[key],r.ratingMigrations[key]);
 r.ratingMigrations.cells.forEach((v,i)=>{for(const key of ['base','current','delta','riskBase','riskCurrent','riskDelta'])amount(g.ratingMigrations.cells[i][key],v[key]);assert.equal(g.ratingMigrations.cells[i].count,v.count);});
 assert.deepEqual(g.rateChanges,r.rateChanges);assert.deepEqual(g.filters,r.filters);assert.deepEqual(g.population,r.population);assert.equal(JSON.stringify(r),before);
 const tiny=structuredClone(r);tiny.delta=-1;tiny.base.SALDO_TOTAL=125;tiny.current.SALDO_TOTAL=0;const small=geminiEvidence(tiny);assert.equal(small.delta,'-0.01');assert.equal(small.base.SALDO_TOTAL,'1.25');assert.equal(small.current.SALDO_TOTAL,'0.00');
 tiny.delta=Number.MAX_SAFE_INTEGER;assert.equal(geminiEvidence(tiny).delta,'90071992547409.91');
});

test('Gemini payload, returned evidence and active filters match exactly without residual unfiltered totals',async()=>{
 const rows=validateCSV(readFileSync('data/demo.csv','utf8')).rows;
 for(const filters of [{},{PRODUCTO:'VEHICULO',REGION:'BOGOTA'}]){const options={from:'2025-11-30',to:'2025-12-31',metric:'SALDO_TOTAL',dimension:'PRODUCTO',filters};let sent;
  const response=await askGemini(request({options}),env,async(url,init)=>{sent=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text).evidence;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Prueba.'}]}}]}));});
  assert.equal(response.status,200);const data=await response.json(),expected=geminiEvidence(analyse(rows,options));assert.deepEqual(sent,expected);assert.deepEqual(data.evidence,expected);
  assert.equal(data.evidence.delta,filters.PRODUCTO?'-25573986.00':'-715859081.00');
 }
});
test('quotas, failures and empty output are controlled',async()=>{assert.equal((await askGemini(request(),env,async()=>new Response('{}',{status:429}))).status,429);assert.equal((await askGemini(request(),env,async()=>{throw new Error('network');})).status,502);assert.equal((await askGemini(request(),env,async()=>new Response('{}'))).status,502);});
test('invalid CSV, wrong origin and oversized questions do not call provider',async()=>{const noCall=()=>assert.fail('Provider should not be called');assert.equal((await askGemini(request({csv:'invalid'}),env,noCall)).status,422);assert.equal((await askGemini(request({question:'a'.repeat(801)}),env,noCall)).status,400);const r=request();r.headers.set('origin','https://other.test');assert.equal((await askGemini(r,env,noCall)).status,403);});
test('cooldown avoids immediate retries and API wrong method blocked',async()=>{const r=request();const body=await r.text();const headers=r.headers;const make=()=>new Request(r.url,{method:'POST',headers,body});const mock=async()=>new Response('{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}');assert.equal((await askGemini(make(),env,mock)).status,200);assert.equal((await askGemini(make(),env,mock)).status,429);assert.equal((await worker.fetch(new Request('https://indagadata.test/api/ask'),env)).status,405);});
test('model unavailable, authentication, quota and server errors remain controlled without leaking provider details',async()=>{
 for(const code of [400,403,404,429,500]){
  const response=await askGemini(request(),env,async()=>new Response(JSON.stringify({error:{message:'fake-test-key provider detail'}}),{status:code}));
  assert.equal(response.status,code===429?429:502);const body=await response.json();assert.ok(!body.error.includes('fake-test-key'));assert.ok(!body.error.includes('provider detail'));
  assert.match(body.error,code===429?/Cuota gratuita/:code===400||code===404?/modelo no está disponible/:/motor de análisis sigue/);
 }
});
test('production timeout signal aborts a stalled transport after 25 seconds', {timeout:30000},async()=>{
 const start=Date.now();let aborted=false;
 const response=await askGemini(request(),env,async(url,init)=>new Promise((resolve,reject)=>{
  const watchdog=setTimeout(()=>reject(Error('Signal did not abort')),27000);
  init.signal.addEventListener('abort',()=>{aborted=true;clearTimeout(watchdog);reject(init.signal.reason);},{once:true});
 }));
 assert.equal(aborted,true);assert.ok(Date.now()-start>=24500);assert.equal(response.status,502);assert.match((await response.json()).error,/a tiempo o falló la conexión/);
});
