import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseCSV,validateCSV,analyse,METRICS,contributionCSV} from '../src/engine.mjs';
import * as engine from '../src/engine.mjs';
import * as report from '../src/report.mjs';

// Ejecuta la UI real con DOM/eventos/descargas simulados, sin red ni dependencias.
const uiSource=readFileSync(new URL('../src/ui.mjs',import.meta.url),'utf8');
const demo=readFileSync(new URL('../data/demo.csv',import.meta.url),'utf8');
const raw=parseCSV(demo);
const january=raw.records.filter(r=>r.FECHA_CORTE==='2025-01-31');
const keys=Object.keys(METRICS);
function csvOf(rows){const cell=s=>'"'+String(s).replaceAll('"','""')+'"';return raw.headers.map(cell).join(',')+'\r\n'+rows.map(r=>raw.headers.map(k=>cell(r[k])).join(',')).join('\r\n');}
function expectedCOP(rows,filters={}){return keys.map(k=>rows.filter(r=>Object.entries(filters).every(([key,v])=>!v||r[key]===v)).reduce((sum,r)=>sum+Number(r[k]),0));}
async function mount(csv,{ai=false,ask}={}){
 const nodes=new Map(),downloads=[],blobs=new Map();
 function node(id){if(!nodes.has(id)){let html='';nodes.set(id,{value:'',textContent:'',disabled:false,checked:false,handlers:{},
 get innerHTML(){return html;},set innerHTML(v){html=v;if(v.startsWith('<option'))this.value=v.match(/value="([^"]*)"/)[1];},
 addEventListener(event,handler){this.handlers[event]=handler;}});}return nodes.get(id);}
 const document={getElementById:node,querySelectorAll:()=>[],createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}})};
 const fetch=async(path,init)=>path==='/api/status'?{json:async()=>({gemini:ai})}:path==='/api/ask'?ask(JSON.parse(init.body)):{ok:true,arrayBuffer:async()=>new TextEncoder().encode(csv).buffer};
 const context={...engine,...report,h:report.escapeHTML,money:report.formatMoney,percent:report.formatPercent,document,fetch,crypto:webcrypto,TextDecoder,Blob,
 URL:{createObjectURL(blob){const url='blob:test/'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(){}},
 setTimeout(){},window:{print(){}}};
 await runInNewContext(uiSource.replace(/^import .*;\r?\n/gm,''),context);
 function change(values){for(const [id,value] of Object.entries(values))node(id).value=value;const id=Object.keys(values)[0];node(id).handlers.change();}
 function setFilters(filters={}){change({'filter-product':filters.PRODUCTO??'','filter-region':filters.REGION??''});}
 function kpis(){return [...node('kpis').innerHTML.matchAll(/title="([^"]+) COP"/g)].map(m=>Number(m[1].replaceAll('.','').replace(',','.')));}
 async function upload(text){await node('file').handlers.change({target:{files:[{name:'fixture.csv',size:Buffer.byteLength(text),arrayBuffer:async()=>new TextEncoder().encode(text).buffer}]}});}
 async function download(id){node(id).handlers.click();return Buffer.from(await downloads.at(-1).blob.arrayBuffer()).toString('utf8');}
 return {node,change,setFilters,kpis,upload,download};
}
function assertSingle(ui,amounts){
 assert.deepEqual(ui.kpis(),amounts);
 for(const id of ['download','json-download','csv-download','print','ask'])assert.equal(ui.node(id).disabled,true,id);
 for(const id of ['trend','trend-table','bars','contribution-table','ratios','reconcile','population'])assert.equal(ui.node(id).innerHTML,'',id);
 for(const id of ['population-bridge','rating-migrations'])assert.equal(ui.node(id).innerHTML,'',id);
 assert.equal(ui.node('population-analysis').hidden,true);
 assert.match(ui.node('message').innerHTML,/al menos dos cortes/);
 assert.match(ui.node('message').innerHTML,/HTML.*JSON.*CSV.*impresión\/PDF/);
 assert.doesNotMatch(ui.node('message').innerHTML,/notice error/);
 assert.match(ui.node('trend-subtitle').textContent,/^1 corte disponible/);
 assert.equal(ui.node('metric-legend').textContent,'');
 assert.doesNotMatch(ui.node('kpis').innerHTML,/vs\. base/);
 for(const id of ['from','to','metric','dimension'])assert.equal(ui.node(id).disabled,true,id);
 for(const id of ['filter-product','filter-region'])assert.equal(ui.node(id).disabled,false,id);
}

test('UI Gemini: envía comparación y filtros activos; limpia la respuesta al cambiar la selección',async()=>{
 const requests=[];const ui=await mount(demo,{ai:true,ask:async body=>{requests.push(body);return {ok:true,json:async()=>({answer:'Respuesta '+requests.length,notice:'IA'})};}});
 ui.node('question').value='¿Qué cambió?';ui.node('consent').checked=true;ui.node('question').handlers.input();
 assert.equal(ui.node('ask').disabled,false);await ui.node('ask').handlers.click();assert.match(ui.node('answer').textContent,/Respuesta 1/);
 ui.setFilters({PRODUCTO:'VEHICULO',REGION:'BOGOTA'});assert.equal(ui.node('answer').textContent,'');await ui.node('ask').handlers.click();
 assert.equal(requests.length,2);assert.equal(requests[1].options.filters.PRODUCTO,'VEHICULO');assert.equal(requests[1].options.filters.REGION,'BOGOTA');assert.equal(requests[1].options.from,'2025-11-30');assert.equal(requests[1].options.to,'2025-12-31');assert.equal(requests[1].consent,true);assert.ok(requests[1].csv===demo.replace(/^\uFEFF/,''),'Decoded CSV matches original apart from UTF-8 BOM');
});

test('UI Gemini: ignora una respuesta en vuelo tras cambiar filtros y bloquea consulta con un corte',async()=>{
 let complete;const ui=await mount(demo,{ai:true,ask:()=>new Promise(resolve=>{complete=resolve;})});
 ui.node('question').value='¿Qué cambió?';ui.node('consent').checked=true;ui.node('question').handlers.input();
 const pending=ui.node('ask').handlers.click();ui.setFilters({PRODUCTO:'VEHICULO'});complete({ok:true,json:async()=>({answer:'Resultado antiguo',notice:'IA'})});await pending;assert.equal(ui.node('answer').textContent,'');
 await ui.upload(csvOf(january));assertSingle(ui,expectedCOP(january));
});

test('UI: reproduce enero VEHICULO y conserva los cuatro indicadores sin filtros',async()=>{
 const ui=await mount(csvOf(january));
 assertSingle(ui,[28876423097,1189601299,7230668726,8258254444]);
 ui.setFilters({PRODUCTO:'VEHICULO'});
 assertSingle(ui,[3764326530,142577573,1046439577,1012223370]);
});
test('UI: un corte respeta region, filtros combinados, cambios y limpieza de filtros',async()=>{
 const ui=await mount(csvOf(january));
 for(const filters of [{REGION:'BOGOTA'},{PRODUCTO:'VEHICULO',REGION:'BOGOTA'},{PRODUCTO:'COMERCIAL_PYME',REGION:'ANTIOQUIA'},{PRODUCTO:'CONSUMO_LIBRANZA'},{}]){
  ui.setFilters(filters);assertSingle(ui,expectedCOP(january,filters));
 }
 ui.setFilters({PRODUCTO:'VEHICULO',REGION:'BOGOTA'});assertSingle(ui,[1288126939,46454477,404827440,423910135]);
});
test('UI: un corte con interseccion vacia muestra cero y permite recuperar el filtro',async()=>{
 const rows=[january.find(r=>r.PRODUCTO==='VEHICULO'&&r.REGION==='BOGOTA'),january.find(r=>r.PRODUCTO==='COMERCIAL_PYME'&&r.REGION==='ATLANTICO')];
 assert.ok(rows.every(Boolean));
 const ui=await mount(csvOf(rows));ui.setFilters({PRODUCTO:'VEHICULO',REGION:'ATLANTICO'});
 assertSingle(ui,[0,0,0,0]);ui.setFilters({PRODUCTO:'VEHICULO'});assertSingle(ui,expectedCOP(rows,{PRODUCTO:'VEHICULO'}));
});
test('UI: varios cortes conservan indicadores, evidencia completa, conciliacion e informes/exportaciones',async()=>{
 const validated=validateCSV(demo);assert.equal(validated.ok,true);const ui=await mount(demo);
 const cases=[
  {from:'2025-11-30',to:'2025-12-31',metric:'SALDO_TOTAL',dimension:'PRODUCTO',filters:{}},
  {from:'2025-11-30',to:'2025-12-31',metric:'SALDO_TOTAL',dimension:'PRODUCTO',filters:{PRODUCTO:'VEHICULO'}},
  {from:'2025-01-31',to:'2025-12-31',metric:'PROV_TOTAL',dimension:'REGION',filters:{REGION:'BOGOTA'}},
  {from:'2025-11-30',to:'2025-12-31',metric:'SALDO_MORA_30_MAS',dimension:'ESTADO_CREDITO',filters:{PRODUCTO:'VEHICULO',REGION:'BOGOTA'}},
  {from:'2025-01-31',to:'2025-04-30',metric:'PROV_TOTAL',dimension:'CALIFICACION_HOMOLOGADA',filters:{}},
  {from:'2025-02-28',to:'2025-09-30',metric:'SALDO_ALTO_RIESGO_CDE',dimension:'CLASE_CARTERA',filters:{REGION:'ANTIOQUIA'}}
 ];
 for(const c of cases){
  ui.change({'from':c.from,'to':c.to,'metric':c.metric,'dimension':c.dimension,'filter-product':c.filters.PRODUCTO??'','filter-region':c.filters.REGION??''});
  const options={...c,filters:{PRODUCTO:c.filters.PRODUCTO??'',REGION:c.filters.REGION??''}},expected=analyse(validated.rows,options);
  assert.deepEqual(ui.kpis(),keys.map(k=>expected.current[k]/100));
  assert.equal(expected.reconciliation,0);assert.match(ui.node('reconcile').innerHTML,/Diferencia cero/);
  for(const id of ['download','json-download','csv-download','print'])assert.equal(ui.node(id).disabled,false,id);
  const json=JSON.parse(await ui.download('json-download'));
  assert.deepEqual(json.evidence,JSON.parse(JSON.stringify(expected)));
  assert.equal(await ui.download('csv-download'),contributionCSV(expected));
  const html=await ui.download('download');assert.match(html,/Informe de variaciones observadas/);
  assert.ok(html.includes(report.formatMoney(expected.delta)));assert.ok(html.includes(json.metadata.sha256));
 }
});
test('UI: cargar varios cortes despues de uno, y viceversa, no conserva resultados anteriores',async()=>{
 const ui=await mount(demo);ui.setFilters({PRODUCTO:'VEHICULO',REGION:'BOGOTA'});
 assert.ok(ui.node('contribution-table').innerHTML);
 await ui.upload(csvOf(january));assertSingle(ui,expectedCOP(january));
 ui.setFilters({PRODUCTO:'VEHICULO'});assertSingle(ui,[3764326530,142577573,1046439577,1012223370]);
 await ui.upload(demo);
 const baseline=analyse(validateCSV(demo).rows);
 assert.deepEqual(ui.kpis(),keys.map(k=>baseline.current[k]/100));
 assert.equal(ui.node('json-download').disabled,false);assert.match(ui.node('reconcile').innerHTML,/Diferencia cero/);
});
test('UI: fechas iguales o invertidas con varios cortes siguen bloqueando comparacion y exportaciones',async()=>{
 const ui=await mount(demo);
 for(const [from,to] of [['2025-01-31','2025-01-31'],['2025-12-31','2025-01-31']]){
  ui.change({from,to});assert.deepEqual(ui.kpis(),[]);assert.equal(ui.node('download').disabled,true);assert.equal(ui.node('contribution-table').innerHTML,'');
 }
 ui.change({from:'2025-11-30',to:'2025-12-31'});assert.equal(ui.node('download').disabled,false);assert.equal(ui.kpis()[0],21056687117);
});

test('UI: alternar doce, uno, dos y doce cortes restaura textos y controles sin residuos',async()=>{
 const ui=await mount(demo);
 ui.change({metric:'PROV_TOTAL',dimension:'REGION'});
 assert.equal(ui.node('metric-legend').textContent,'Provisiones');
 for(const count of [1,2,12,1,12]){
  const rows=count===12?raw.records:raw.records.filter(r=>count===1?r.FECHA_CORTE==='2025-01-31':['2025-01-31','2025-02-28'].includes(r.FECHA_CORTE));
  await ui.upload(csvOf(rows));
  assert.match(ui.node('source-detail').textContent,new RegExp(' · '+count+' '+(count===1?'corte':'cortes')+' · '));
  if(count===1){
   assertSingle(ui,expectedCOP(january));
   for(const id of ['download','json-download','csv-download','print'])assert.match(ui.node(id).title,/al menos dos cortes/,id);
   ui.setFilters({PRODUCTO:'VEHICULO',REGION:'BOGOTA'});assertSingle(ui,[1288126939,46454477,404827440,423910135]);
  }else{
   assert.equal(ui.node('trend-subtitle').textContent,count+' cortes · mismo ámbito de filtros en todos los periodos');
   assert.equal(ui.node('metric-legend').textContent,'Provisiones');
   assert.equal(ui.node('message').innerHTML,'');
   assert.match(ui.node('kpis').innerHTML,/vs\. base/);
   for(const id of ['from','to','metric','dimension','download','json-download','csv-download','print']){
    assert.equal(ui.node(id).disabled,false,id);assert.equal(ui.node(id).title,'',id);
   }
   assert.match(ui.node('reconcile').innerHTML,/Diferencia cero/);
  }
 }
});
test('UI: puente y migraciones cambian con métrica y filtros, y desaparecen al cargar un corte',async()=>{
 const ui=await mount(demo),rows=validateCSV(demo).rows;
 for(const filters of [{},{PRODUCTO:'VEHICULO',REGION:'BOGOTA'},{REGION:'NO_EXISTE'}])for(const metric of keys){
  ui.change({metric,'filter-product':filters.PRODUCTO??'','filter-region':filters.REGION??''});
  const r=analyse(rows,{metric,filters});
  assert.equal(ui.node('population-analysis').hidden,false);
  assert.equal(ui.node('population-bridge').innerHTML,report.buildPopulationBridge(r));
  assert.equal(ui.node('rating-migrations').innerHTML,report.buildRatingMigrations(r));
 }
 await ui.upload(csvOf(january));assertSingle(ui,expectedCOP(january));
 await ui.upload(demo);assert.equal(ui.node('population-analysis').hidden,false);assert.match(ui.node('rating-migrations').innerHTML,/318/);
});

test('UI: limpiar o bloquear un archivo elimina etiquetas y motivos del modo de un corte',async()=>{
 const ui=await mount(csvOf(january));assertSingle(ui,expectedCOP(january));
 ui.node('clear').handlers.click();
 assert.equal(ui.node('trend-subtitle').textContent,'');assert.equal(ui.node('metric-legend').textContent,'');
 for(const id of ['download','json-download','csv-download','print']){
  assert.equal(ui.node(id).disabled,true,id);assert.equal(ui.node(id).title,'',id);
 }
 await ui.upload('csv,incorrecto\n1,2');
 assert.equal(ui.node('analysis').hidden,true);assert.equal(ui.node('trend-subtitle').textContent,'');
 assert.doesNotMatch(ui.node('message').innerHTML,/al menos dos cortes/);
 await ui.upload(demo);assert.match(ui.node('trend-subtitle').textContent,/^12 cortes/);
 assert.equal(ui.node('download').disabled,false);
});
