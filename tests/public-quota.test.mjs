import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{askGemini,createQuotaLimiter} from '../worker/index.js';
const start=Date.parse('2026-10-17T12:00:00Z');
test('courtesy budget is per isolate, nonpersistent, and blocks rapid calls regardless of identity',()=>{
 const limit=createQuotaLimiter();assert.equal(limit(start),null);
 assert.equal(limit(start+14999).status,429);assert.equal(limit(start+15000),null);
 // A new isolate starts a new budget: do not describe this as a global cap.
 assert.equal(createQuotaLimiter()(start),null);
});
test('one isolate reserves synchronously before async requests can race',async()=>{
 const limit=createQuotaLimiter();
 const result=await Promise.all(Array.from({length:12},async()=>limit(start)));
 assert.equal(result.filter(x=>x===null).length,1);assert.equal(result.filter(x=>x?.status===429).length,11);
});
test('twenty provider attempts exhaust courtesy daily allowance; UTC rollover resets count',()=>{
 const limit=createQuotaLimiter();for(let i=0;i<20;i++)assert.equal(limit(start+i*15000),null);
 const blocked=limit(start+20*15000);assert.equal(blocked.status,429);assert.match(blocked.error,/20 consultas/);
 assert.equal(limit(Date.parse('2026-10-18T00:00:00Z')),null);
});
test('UTC rollover preserves minimum interval',()=>{
 const limit=createQuotaLimiter(),midnight=Date.parse('2026-10-18T00:00:00Z');
 assert.equal(limit(midnight-5000),null);assert.equal(limit(midnight).status,429);assert.equal(limit(midnight+10000),null);
});
test('status describes quota scope without secret values or extra services',async()=>{
 const env={GEMINI_API_KEY:'fake-test-key',GEMINI_FREE_TIER_CONFIRMED:'true'};
 const response=await worker.fetch(new Request('https://indagadata.test/api/status'),env),status=await response.json();
 assert.equal(status.gemini,true);assert.deepEqual(status.limits,{dailyRequests:20,dayTimezone:'UTC',intervalSeconds:15,scope:'isolate-memory',persistent:false});
 assert.ok(!JSON.stringify(status).includes(env.GEMINI_API_KEY));
});
let sequence=10000;
const req=()=>new Request('https://indagadata.test/api/ask',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':String(++sequence)},body:JSON.stringify({csv:readFileSync('data/demo.csv','utf8'),question:'¿Qué cambió?',consent:true,options:{}})});
test('quota denial blocks Google despite changed identity; provider failures consume reservation',async()=>{
 const env={GEMINI_API_KEY:'fake-test-key',GEMINI_FREE_TIER_CONFIRMED:'true'},limit=createQuotaLimiter();let calls=0;
 assert.equal((await askGemini(req(),env,async()=>{calls++;throw Error('network');},limit)).status,502);
 assert.equal((await askGemini(req(),env,()=>assert.fail('Google must not be called'),limit)).status,429);assert.equal(calls,1);
});
test('backend rejects generated output containing configured secret',async()=>{
 const env={GEMINI_API_KEY:'fake-test-key',GEMINI_FREE_TIER_CONFIRMED:'true'};
 const response=await askGemini(req(),env,async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'fake-test-key'}]}}]})),createQuotaLimiter());
 assert.equal(response.status,502);assert.ok(!(await response.text()).includes(env.GEMINI_API_KEY));
});
