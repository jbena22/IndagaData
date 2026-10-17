import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCSV,validateCSV,analyse,publicEvidence,METRICS,DIMENSIONS,contributionCSV} from '../src/engine.mjs';
import {buildReport,buildPopulationBridge,buildRatingMigrations} from '../src/report.mjs';
const demo=readFileSync(new URL('../data/demo.csv',import.meta.url),'utf8');
const raw=parseCSV(demo),validated=validateCSV(demo);
function record(id,period,balance,rating='A',product='VEHICULO',region='BOGOTA'){
 return {...raw.records[0],ID_CREDITO:id,ID_CLIENTE:id,FECHA_CORTE:period,PRODUCTO:product,REGION:region,CALIFICACION_HOMOLOGADA:rating,SALDO_CAPITAL:String(balance),SALDO_INTERES_CXC:'0',SALDO_OTROS_INT:'0',SALDO_TOTAL:String(balance),PROV_CAPITAL:String(Number(balance)/10),PROV_CXC:'0',PROV_INTERES:'0',PROV_TOTAL:String(Number(balance)/10),DIAS_MORA_CAPITAL:'35',DIAS_MORA_INTERESES:'35',SALDO_MORA_30_MAS:String(balance),SALDO_ALTO_RIESGO_CDE:['C','D','E'].includes(rating)?String(balance):'0'};
}
function valid(records){const cell=v=>'"'+String(v).replaceAll('"','""')+'"';const csv=[raw.headers,...records.map(r=>raw.headers.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\n');const v=validateCSV(csv);assert.equal(v.ok,true,JSON.stringify(v.errors));return v.rows;}
const jan='2025-01-31',mar='2025-03-31';
function example(){return valid([record('001',jan,100),record('002',jan,50,'C'),record('003',jan,30),record('001',mar,80,'C'),record('002',mar,70,'B'),record('004',mar,40,'D')]);}
test('puente separa permanencias, entradas y salidas sin confundirlas con causas',()=>{
 const r=analyse(example());const b=r.populationBridge;
 assert.deepEqual(b.retained,{count:2,base:15000,current:15000,delta:0});
 assert.deepEqual(b.entered,{count:1,base:0,current:4000,delta:4000});
 assert.deepEqual(b.exited,{count:1,base:3000,current:0,delta:-3000});
 assert.equal(b.delta,1000);assert.equal(b.reconciliation,0);assert.equal(r.reconciliation,0);
 const m=r.ratingMigrations;assert.equal(m.retainedCount,2);assert.equal(m.changedCount,2);assert.equal(m.unchangedCount,0);
 assert.equal(m.cells.find(c=>c.from==='A'&&c.to==='C').delta,-2000);
 assert.equal(m.cells.find(c=>c.from==='C'&&c.to==='B').delta,2000);
 assert.equal(m.riskDelta,3000);assert.equal(m.reconciliation,0);assert.equal(m.riskReconciliation,0);
});
test('las cuatro métricas, cortes no contiguos y dimensiones conservan conciliación exacta',()=>{
 for(const metric of Object.keys(METRICS))for(const dimension of DIMENSIONS){const r=analyse(example(),{from:jan,to:mar,metric,dimension});const b=r.populationBridge,m=r.ratingMigrations;
  assert.equal(b.retained.delta+b.entered.delta+b.exited.delta,r.delta);
  assert.equal(m.cells.reduce((n,c)=>n+c.delta,0),b.retained.delta);assert.equal(m.cells.reduce((n,c)=>n+c.count,0),r.population.retained);
  assert.equal(b.reconciliation,0);assert.equal(m.reconciliation,0);assert.equal(m.riskReconciliation,0);
 }
});
test('filtros definen pertenencia en cada corte; cambios de producto no son nuevas operaciones',()=>{
 const rows=valid([record('001',jan,100,'A','VEHICULO'),record('001',mar,80,'C','OTRO'),record('002',jan,50,'B','OTRO'),record('002',mar,40,'D','VEHICULO'),record('003',jan,30),record('003',mar,20,'B')]);
 const r=analyse(rows,{filters:{PRODUCTO:'VEHICULO',REGION:'BOGOTA'}});
 assert.deepEqual(r.population,{retained:1,entered:1,exited:1});assert.equal(r.populationBridge.retained.delta,-1000);assert.equal(r.populationBridge.entered.delta,4000);assert.equal(r.populationBridge.exited.delta,-10000);assert.equal(r.delta,-7000);
 assert.equal(r.ratingMigrations.cells.length,1);assert.equal(r.ratingMigrations.cells[0].from,'A');assert.equal(r.ratingMigrations.cells[0].to,'B');
 const empty=analyse(rows,{filters:{REGION:'NO_EXISTE'}});assert.equal(empty.populationBridge.delta,0);assert.deepEqual(empty.ratingMigrations.cells,[]);assert.equal(empty.ratingMigrations.retainedCount,0);
});
test('sin créditos compartidos no se fabrican migraciones; calificaciones desconocidas conservan sus códigos',()=>{
 const r=analyse(valid([record('001',jan,100),record('002',mar,80,'C')]));assert.deepEqual(r.ratingMigrations.cells,[]);assert.equal(r.populationBridge.retained.count,0);assert.equal(r.populationBridge.reconciliation,0);
 const unknown=analyse(valid([record('001',jan,100,'<script>x</script>'),record('001',mar,80,'Z')]));assert.equal(unknown.ratingMigrations.cells[0].from,'<script>x</script>');assert.equal(unknown.ratingMigrations.changedCount,1);
 assert.ok(buildRatingMigrations(unknown).includes('&lt;script&gt;'));assert.ok(!buildRatingMigrations(unknown).includes('<script>'));
});
test('cambio neto cero mantiene migraciones y sus compensaciones observadas',()=>{
 const r=analyse(valid([record('001',jan,100,'A'),record('002',jan,100,'C'),record('001',mar,90,'C'),record('002',mar,110,'A')]));assert.equal(r.delta,0);assert.equal(r.ratingMigrations.changedCount,2);assert.equal(r.ratingMigrations.delta,0);assert.equal(r.ratingMigrations.riskDelta,-1000);assert.equal(r.populationBridge.reconciliation,0);
});
test('migraciones y puente se incluyen en informes y evidencia sin identificadores individuales',()=>{
 const r=analyse(example()),json=JSON.stringify(publicEvidence(r));assert.ok(!json.includes('ID_CREDITO'));assert.ok(!json.includes('ID_CLIENTE'));
 const html=buildReport(r,{name:'synthetic.csv',sha256:'test',generatedAt:'now'},{rowCount:6,periods:[jan,mar],errors:[],warnings:[]});
 assert.ok(html.includes(buildPopulationBridge(r)));assert.ok(html.includes(buildRatingMigrations(r)));assert.match(html,/ámbito filtrado/);assert.match(html,/no demuestran desembolsos/);
});
test('dataset original: 1.320 resultados financieros previos y CSV permanecen idénticos',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/financial-baseline-2026-10-15.json',import.meta.url),'utf8'));
 let count=0;for(let i=0;i<12;i++)for(let j=i+1;j<12;j++)for(const dimension of DIMENSIONS)for(const metric of Object.keys(METRICS)){
  const r=analyse(validated.rows,{from:validated.periods[i],to:validated.periods[j],dimension,metric});
  const {populationBridge,ratingMigrations,...legacy}=r;
  assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),baseline.fingerprints[[r.from,r.to,dimension,metric].join('|')]);
  assert.equal(populationBridge.reconciliation,0);assert.equal(ratingMigrations.reconciliation,0);assert.equal(ratingMigrations.riskReconciliation,0);count++;
 }
 const r=analyse(validated.rows);assert.equal(count,1320);assert.equal(r.populationBridge.retained.delta,-71585908100);assert.equal(r.populationBridge.entered.delta,0);assert.equal(r.populationBridge.exited.delta,0);assert.equal(r.ratingMigrations.changedCount,318);
 assert.equal(createHash('sha256').update(contributionCSV(r)).digest('hex'),baseline.csvSHA256);
});
