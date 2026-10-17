import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {csvCell,parseCSV} from '../src/core/csv.mjs';
import {cents} from '../src/core/math.mjs';
import {validateCSV,analyse,contributionCSV} from '../src/engine.mjs';

test('CSV conserva números negativos, decimales y cero sin apóstrofo',()=>{
 for(const value of [-256711009,-0.25,0,1.25,Number.MIN_SAFE_INTEGER])
  assert.equal(csvCell(value),'"'+String(value)+'"');
});
test('CSV protege prefijos de fórmulas en textos no confiables',()=>{
 for(const value of ['=SUM(A1:A2)','+cmd','-texto','-256711009','@cmd','\t=1+1','\r=1+1'])
  assert.equal(csvCell(value),'"\''+value+'"');
 assert.equal(csvCell('producto, "especial"'),'"producto, ""especial"""');
});
test('lectura decimal y conversión de centavos no cambian',()=>{
 assert.equal(cents('49755473.0'),4975547300);
 assert.equal(cents('39558966.0'),3955896600);
 assert.equal(cents('1.25'),125);
 assert.equal(cents('49.755.473,0'),null);
});
const validated=validateCSV(readFileSync(new URL('../data/demo.csv',import.meta.url),'utf8'));
test('CSV de cartera exporta importes negativos numéricos en COP y concilia',()=>{
 assert.equal(validated.ok,true);const r=analyse(validated.rows);
 assert.equal(r.current.SALDO_TOTAL,2105668711700); // centavos internos
 assert.equal(r.delta,-71585908100);
 const csv=contributionCSV(r);assert.ok(csv.includes('"-256711009"'));
 assert.ok(!csv.includes('"\'-256711009"'));
 const data=parseCSV(csv).records;
 for(const record of data){
  const expected=r.contributions.find(g=>g.segment===record.segmento);
  assert.equal(Number(record.base_COP),expected.base/100);
  assert.equal(Number(record.actual_COP),expected.current/100);
  assert.equal(Number(record.variacion_COP),expected.delta/100);
  assert.equal(Number(record.contribucion_neta_pct),expected.netContribution*100);
  assert.equal(Number(record.peso_cambio_bruto_pct),expected.grossShare*100);
 }
 assert.equal(data.reduce((n,g)=>n+Number(g.variacion_COP),0),-715859081);
 assert.equal(r.reconciliation,0);
});
test('CSV mantiene porcentajes y aportes negativos en desgloses con compensación',()=>{
 const r=analyse(validated.rows,{from:'2025-01-31',to:'2025-04-30',metric:'PROV_TOTAL',dimension:'CALIFICACION_HOMOLOGADA'});
 assert.ok(r.contributions.some(g=>g.netContribution<0));
 const data=parseCSV(contributionCSV(r)).records;
 for(const record of data){const expected=r.contributions.find(g=>g.segment===record.segmento);
  assert.ok(!record.contribucion_neta_pct.startsWith("'"));
  assert.equal(Number(record.variacion_COP),expected.delta/100);
  assert.equal(Number(record.contribucion_neta_pct),expected.netContribution*100);
 }
 assert.equal(r.reconciliation,0);
});
