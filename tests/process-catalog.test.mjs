import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProcessRegistry} from '../src/core/registry.mjs';
import {processRegistry,REGISTRY,analyse,validateCSV} from '../src/engine.mjs';
import {bankingProcess} from '../src/processes/banking-definition.mjs';
import {catalogHTML,createProcessLauncher} from '../src/catalog.mjs';

test('catálogo y registro comparten el único proceso, contrato y funciones bancarias',()=>{
 assert.deepEqual(processRegistry.list().map(p=>p.definition.id),['banking-portfolio-v1']);
 assert.equal(REGISTRY['banking-portfolio-v1'],bankingProcess);
 assert.equal(bankingProcess.validate,validateCSV);assert.equal(bankingProcess.analyse,analyse);
 assert.equal(bankingProcess.definition.dataset.requiredColumns.length,24);
 assert.equal(Object.keys(bankingProcess.metrics).length,4);
 const html=catalogHTML(processRegistry);
 for(const value of [bankingProcess.definition.label,bankingProcess.definition.description,'Objetivo','Dataset requerido','Disponible','24 columnas','Iniciar análisis'])assert.ok(html.includes(value),value);
 assert.equal((html.match(/data-start-process=/g)||[]).length,1);
});
test('registro rechaza contratos incompletos, duplicados y selección desconocida',()=>{
 assert.throws(()=>createProcessRegistry([{}]),/incompleta/);
 assert.throws(()=>createProcessRegistry([{...bankingProcess,loadView:null}]),/vista/);
 assert.throws(()=>createProcessRegistry([bankingProcess,bankingProcess]),/duplicado/);
 assert.throws(()=>processRegistry.get('unknown'),/no disponible/);
});
test('seleccionar carga la vista del módulo una sola vez y conserva su población y filtros',async()=>{
 let starts=0,received,selected;
 const view={hidden:true},process={...bankingProcess,loadView:async()=>adapter=>{starts++;received=adapter;view.filters={PRODUCTO:'VEHICULO'};}};
 const registry=createProcessRegistry([process]);
 const launch=createProcessLauncher({registry,document:{getElementById:()=>view},onSelection:d=>selected=d});
 await Promise.all([launch(process.definition.id),launch(process.definition.id)]);
 assert.equal(starts,1);assert.equal(received,process);assert.equal(view.hidden,false);assert.equal(selected,process.definition);
 view.filters.REGION='BOGOTA';await launch(process.definition.id);assert.equal(view.filters.REGION,'BOGOTA');assert.equal(starts,1);
 await assert.rejects(launch('unknown'),/no disponible/);
});
test('proceso no disponible se muestra deshabilitado y nunca ejecuta su vista',async()=>{
 const process={...bankingProcess,definition:{...bankingProcess.definition,status:'unavailable'},loadView:()=>{throw new Error('No debe ejecutarse');}};
 const registry=createProcessRegistry([process]);assert.match(catalogHTML(registry),/disabled/);
 const launch=createProcessLauncher({registry,document:{getElementById:()=>({})}});await assert.rejects(launch(process.definition.id),/todavía no/);
});
test('fallo de carga informa el error y permite reintentar sin aparentar selección activa',async()=>{
 let calls=0,selections=0;const view={hidden:true};
 const registry=createProcessRegistry([{...bankingProcess,loadView:async()=>{if(++calls===1)throw new Error('Fallo de red');return ()=>{};}}]);
 const launch=createProcessLauncher({registry,document:{getElementById:()=>view},onSelection:()=>selections++});
 await assert.rejects(launch(bankingProcess.definition.id),/Fallo de red/);assert.equal(view.hidden,true);assert.equal(selections,0);
 await launch(bankingProcess.definition.id);assert.equal(view.hidden,false);assert.equal(selections,1);
});
test('adaptador conserva exactamente análisis, puente, migraciones y CSV del motor',()=>{
 const csv=readFileSync(new URL('../data/demo.csv',import.meta.url),'utf8'),quality=bankingProcess.validate(csv);
 for(const filters of [{},{PRODUCTO:'VEHICULO'},{REGION:'BOGOTA'},{PRODUCTO:'VEHICULO',REGION:'BOGOTA'}]){
  const options={from:'2025-11-30',to:'2025-12-31',filters};
  const actual=bankingProcess.analyse(quality.rows,options);assert.deepEqual(actual,analyse(quality.rows,options));
  assert.equal(actual.reconciliation,0);assert.equal(actual.populationBridge.reconciliation,0);assert.equal(actual.ratingMigrations.reconciliation,0);
 }
 const result=bankingProcess.analyse(quality.rows);
 assert.equal(result.delta,-71585908100);
 assert.equal(result.contributions.find(c=>c.segment==='CONSUMO_LIBRE_INVERSION').delta,-25671100900);
 assert.match(bankingProcess.exportCSV(result),/-256711009/);
});
