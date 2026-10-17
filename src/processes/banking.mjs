import {safeSum,ratio,cents} from '../core/math.mjs';
import {parseCSV,csvCell} from '../core/csv.mjs';
// Contrato v1 del proceso especializado. Importes internos en centavos enteros.
export const MONEY = ['SALDO_CAPITAL','SALDO_INTERES_CXC','SALDO_OTROS_INT','PROV_CAPITAL','PROV_CXC','PROV_INTERES','INGRESO_ANUAL_ESTIMADO','SALDO_TOTAL','PROV_TOTAL','SALDO_MORA_30_MAS','SALDO_ALTO_RIESGO_CDE'];
export const DIMENSIONS = ['PRODUCTO','REGION','CLASE_CARTERA','CALIFICACION_HOMOLOGADA','ESTADO_CREDITO'];
export const REQUIRED = ['FECHA_CORTE','ID_CREDITO','ID_CLIENTE','CLASE_CARTERA','PRODUCTO','REGION','SALDO_CAPITAL','SALDO_INTERES_CXC','SALDO_OTROS_INT','PROV_CAPITAL','PROV_CXC','PROV_INTERES','DIAS_MORA_CAPITAL','DIAS_MORA_INTERESES','CALIFICACION_HOMOLOGADA','TASA_INTERES_EA','PLAZO_ORIGINAL_MESES','EDAD_CREDITO_MESES','INGRESO_ANUAL_ESTIMADO','ESTADO_CREDITO','SALDO_TOTAL','PROV_TOTAL','SALDO_MORA_30_MAS','SALDO_ALTO_RIESGO_CDE'];
export const METRICS = {SALDO_TOTAL:'Saldo total',PROV_TOTAL:'Provisiones',SALDO_MORA_30_MAS:'Saldo en mora 30+',SALDO_ALTO_RIESGO_CDE:'Exposición C/D/E'};
export const PROCESS = {id:'banking-portfolio-v1',version:'1.0.0',label:'Cartera bancaria mensual',currency:'COP'};
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
export function validateCSV(text){
 let parsed;try{parsed=parseCSV(text,REQUIRED);}catch(e){return {ok:false,errors:[{rule:'CSV',count:1,examples:[],message:e.message}],warnings:[],rows:[],rowCount:0,headers:[]};}
 const issues=new Map();const add=(level,rule,message,line)=>{const key=level+rule;if(!issues.has(key))issues.set(key,{level,rule,message,count:0,examples:[]});const x=issues.get(key);x.count++;if(x.examples.length<5)x.examples.push(line);};
 const seen=new Set();const rows=[];
 parsed.records.forEach((raw,i)=>{const line=i+2;const r={...raw};let valid=true;
  const fail=(rule,message)=>{valid=false;add('error',rule,message,line);};
  for(const k of REQUIRED)if(raw[k]==='')fail('EMPTY','Hay celdas obligatorias vacías.');
  if(!validDate(raw.FECHA_CORTE))fail('DATE','FECHA_CORTE requiere una fecha real AAAA-MM-DD.');
  else if(new Date(raw.FECHA_CORTE+'T00:00:00Z').getUTCDate()!==new Date(Date.UTC(Number(raw.FECHA_CORTE.slice(0,4)),Number(raw.FECHA_CORTE.slice(5,7)),0)).getUTCDate())fail('MONTH_END','Se requiere un corte de fin de mes.');
  for(const k of MONEY){r[k]=cents(raw[k]);if(r[k]===null)fail('MONEY','Importes: número no negativo con punto decimal y máximo dos decimales.');}
  for(const k of ['DIAS_MORA_CAPITAL','DIAS_MORA_INTERESES','PLAZO_ORIGINAL_MESES','EDAD_CREDITO_MESES']){r[k]=Number(raw[k]);if(!/^\d+$/.test(raw[k])||!Number.isSafeInteger(r[k]))fail('INTEGER','Días, plazo y edad deben ser enteros no negativos.');}
  r.TASA_INTERES_EA=Number(raw.TASA_INTERES_EA);if(!/^\d+(?:\.\d+)?$/.test(raw.TASA_INTERES_EA)||!Number.isFinite(r.TASA_INTERES_EA))fail('RATE','TASA_INTERES_EA debe ser numérica y no negativa.');
  for(const k of ['ID_CREDITO','ID_CLIENTE'])if(!/^\d+$/.test(raw[k]))fail('ID','Los identificadores deben contener dígitos; se conservan como texto.');
  const key=raw.FECHA_CORTE+'|'+raw.ID_CREDITO;if(seen.has(key))fail('DUPLICATE','Más de un registro para el mismo crédito y corte.');seen.add(key);
  if(valid){
   try{
    if(r.SALDO_TOTAL!==[r.SALDO_CAPITAL,r.SALDO_INTERES_CXC,r.SALDO_OTROS_INT].reduce(safeSum,0))fail('BALANCE','SALDO_TOTAL no coincide con capital e intereses.');
    if(r.PROV_TOTAL!==[r.PROV_CAPITAL,r.PROV_CXC,r.PROV_INTERES].reduce(safeSum,0))fail('PROVISION','PROV_TOTAL no coincide con sus componentes.');
   }catch(e){fail('PRECISION',e.message);}
   if(r.SALDO_MORA_30_MAS!==(r.DIAS_MORA_CAPITAL>=30?r.SALDO_TOTAL:0))fail('ARREARS','SALDO_MORA_30_MAS no coincide con saldo total cuando la mora de capital es ≥30 días.');
   if(r.SALDO_ALTO_RIESGO_CDE!==(['C','D','E'].includes(r.CALIFICACION_HOMOLOGADA)?r.SALDO_TOTAL:0))fail('RISK','SALDO_ALTO_RIESGO_CDE no coincide con el saldo de calificaciones C/D/E.');
   if(!['A','B','C','D','E'].includes(r.CALIFICACION_HOMOLOGADA))add('warning','RATING','Calificación fuera de A/B/C/D/E: revisar significado.',line);
   if(r.PROV_TOTAL>r.SALDO_TOTAL)add('warning','EXCESS_PROVISION','Provisión superior al saldo total: revisar.',line);
   if(r.EDAD_CREDITO_MESES>r.PLAZO_ORIGINAL_MESES)add('warning','AGE','Edad superior al plazo original: revisar; puede existir una prórroga.',line);
   if((r.DIAS_MORA_CAPITAL>=30)!==(r.DIAS_MORA_INTERESES>=30))add('warning','INTEREST_ARREARS','Mora de capital e intereses clasifican de forma distinta. La métrica 30+ usa capital.',line);
   rows.push(r);
  }
 });
 const periods=[...new Set(rows.map(r=>r.FECHA_CORTE))].sort();const months=periods.map(s=>Number(s.slice(0,4))*12+Number(s.slice(5,7)));
 if(months.some((m,i)=>i>0&&m-months[i-1]>1))add('warning','GAPS','Hay meses ausentes: las comparaciones no siempre serán mensuales.',0);
 if(periods.length<2)add('warning','SINGLE_PERIOD','Se necesitan dos cortes para comparar variaciones.',0);
 const errors=[...issues.values()].filter(x=>x.level==='error');const warnings=[...issues.values()].filter(x=>x.level==='warning');
 const extras=parsed.headers.filter(x=>!REQUIRED.includes(x));if(extras.length)warnings.push({rule:'EXTRA',count:extras.length,examples:[],message:'Columnas adicionales no utilizadas: '+extras.join(', ')});
 return {ok:errors.length===0,errors,warnings,rows:errors.length?[]:rows,rowCount:parsed.records.length,headers:parsed.headers,periods};
}
export function totals(rows){const t={count:rows.length,clients:new Set(rows.map(r=>r.ID_CLIENTE)).size};for(const k of Object.keys(METRICS))t[k]=rows.reduce((n,r)=>safeSum(n,r[k]),0);return {...t,provisionRate:ratio(t.PROV_TOTAL,t.SALDO_TOTAL),arrearsRate:ratio(t.SALDO_MORA_30_MAS,t.SALDO_TOTAL),riskRate:ratio(t.SALDO_ALTO_RIESGO_CDE,t.SALDO_TOTAL),coverage:ratio(t.PROV_TOTAL,t.SALDO_MORA_30_MAS)};}
// Emparejar solo dentro del ámbito filtrado de cada corte. No inferir operaciones.
function populationEvidence(base,current,metric,delta){
 const oldRows=new Map(base.map(r=>[r.ID_CREDITO,r])),newRows=new Map(current.map(r=>[r.ID_CREDITO,r]));
 const empty=()=>({count:0,base:0,current:0,delta:0});
 const bridge={metric,retained:empty(),entered:empty(),exited:empty(),delta,reconciliation:0};
 const groups=new Map();let changedCount=0;
 for(const row of current){
  const prior=oldRows.get(row.ID_CREDITO),part=prior?bridge.retained:bridge.entered;part.count++;part.current=safeSum(part.current,row[metric]);
  if(!prior)continue;
  part.base=safeSum(part.base,prior[metric]);
  const from=prior.CALIFICACION_HOMOLOGADA,to=row.CALIFICACION_HOMOLOGADA,key=JSON.stringify([from,to]);
  if(from!==to)changedCount++;
  if(!groups.has(key))groups.set(key,{from,to,count:0,base:0,current:0,delta:0,riskBase:0,riskCurrent:0,riskDelta:0});
  const cell=groups.get(key);cell.count++;cell.base=safeSum(cell.base,prior[metric]);cell.current=safeSum(cell.current,row[metric]);
  cell.riskBase=safeSum(cell.riskBase,prior.SALDO_ALTO_RIESGO_CDE);cell.riskCurrent=safeSum(cell.riskCurrent,row.SALDO_ALTO_RIESGO_CDE);
 }
 for(const row of base)if(!newRows.has(row.ID_CREDITO)){bridge.exited.count++;bridge.exited.base=safeSum(bridge.exited.base,row[metric]);}
 for(const part of [bridge.retained,bridge.entered,bridge.exited])part.delta=part.current-part.base;
 bridge.reconciliation=[bridge.retained.delta,bridge.entered.delta,bridge.exited.delta].reduce(safeSum,0)-delta;
 const cells=[...groups.values()].map(c=>({...c,delta:c.current-c.base,riskDelta:c.riskCurrent-c.riskBase})).sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
 const riskBase=base.reduce((n,r)=>newRows.has(r.ID_CREDITO)?safeSum(n,r.SALDO_ALTO_RIESGO_CDE):n,0),riskCurrent=current.reduce((n,r)=>oldRows.has(r.ID_CREDITO)?safeSum(n,r.SALDO_ALTO_RIESGO_CDE):n,0);
 const migrations={metric,retainedCount:bridge.retained.count,changedCount,unchangedCount:bridge.retained.count-changedCount,base:bridge.retained.base,current:bridge.retained.current,delta:bridge.retained.delta,riskBase,riskCurrent,riskDelta:riskCurrent-riskBase,cells,reconciliation:cells.reduce((n,c)=>safeSum(n,c.delta),0)-bridge.retained.delta,riskReconciliation:cells.reduce((n,c)=>safeSum(n,c.riskDelta),0)-(riskCurrent-riskBase)};
 if(bridge.reconciliation!==0||migrations.reconciliation!==0||migrations.riskReconciliation!==0)throw new Error('El puente de población o las migraciones no concilian.');
 return {populationBridge:bridge,ratingMigrations:migrations};
}
export function analyse(rows,{from,to,metric='SALDO_TOTAL',dimension='PRODUCTO',filters={}}={}){
 if(!Object.hasOwn(METRICS,metric)||!DIMENSIONS.includes(dimension))throw new Error('Métrica o dimensión no admitida.');
 for(const [k,v] of Object.entries(filters))if(!DIMENSIONS.includes(k)||typeof v!=='string')throw new Error('Filtro no admitido.');
 const filtered=rows.filter(r=>Object.entries(filters).every(([k,v])=>!v||r[k]===v));
 const periods=[...new Set(rows.map(r=>r.FECHA_CORTE))].sort();from??=periods.at(-2)??periods[0];to??=periods.at(-1);
 if(!periods.includes(from)||!periods.includes(to)||from>=to)throw new Error('Selecciona dos cortes distintos en orden cronológico.');
 const base=filtered.filter(r=>r.FECHA_CORTE===from),current=filtered.filter(r=>r.FECHA_CORTE===to);
 const a=totals(base),b=totals(current),delta=b[metric]-a[metric];
 const groups=new Map();for(const [side,list] of [['base',base],['current',current]])for(const r of list){const key=r[dimension];if(!groups.has(key))groups.set(key,{segment:key,base:0,current:0,baseCount:0,currentCount:0});const g=groups.get(key);g[side]=safeSum(g[side],r[metric]);g[side+'Count']++;}
 const gross=[...groups.values()].reduce((n,g)=>safeSum(n,Math.abs(g.current-g.base)),0);
 const contributions=[...groups.values()].map(g=>({...g,delta:g.current-g.base,relativeChange:ratio(g.current-g.base,g.base),netContribution:ratio(g.current-g.base,delta),grossShare:ratio(Math.abs(g.current-g.base),gross)})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.segment.localeCompare(b.segment));
 const reconciliation=contributions.reduce((n,g)=>safeSum(n,g.delta),0)-delta;
 if(reconciliation!==0)throw new Error('Las contribuciones no concilian.');
 const oldIds=new Set(base.map(r=>r.ID_CREDITO)),newIds=new Set(current.map(r=>r.ID_CREDITO));let entered=0,exited=0,retained=0;
 for(const id of newIds)oldIds.has(id)?retained++:entered++;for(const id of oldIds)if(!newIds.has(id))exited++;
 const trend=periods.map(period=>({period,...totals(filtered.filter(r=>r.FECHA_CORTE===period))}));
 const changes=Object.fromEntries(Object.keys(METRICS).map(k=>[k,{base:a[k],current:b[k],delta:b[k]-a[k],relativeChange:ratio(b[k]-a[k],a[k])}]));
 const rateChanges=Object.fromEntries(['provisionRate','arrearsRate','riskRate','coverage'].map(k=>[k,{base:a[k],current:b[k],pp:a[k]===null||b[k]===null?null:(b[k]-a[k])*100}]));
 return {process:PROCESS,from,to,metric,dimension,filters,base:a,current:b,delta,relativeChange:ratio(delta,a[metric]),contributions,reconciliation,trend,changes,rateChanges,population:{entered,exited,retained},limits:['Variaciones observadas; no prueban causalidad.','No se suman saldos de distintos cortes como si fueran operaciones.','Cada dimensión es un desglose alternativo; no sumar contribuciones entre dimensiones.','Los cambios de clasificación pueden redistribuir saldos entre segmentos.','Entradas y salidas corresponden al ámbito filtrado; no demuestran desembolsos o cancelaciones.','La moneda COP fue confirmada por el usuario; no consta en el CSV.'],...populationEvidence(base,current,metric,delta)};
}
export function publicEvidence(result){return {...result,trend:result.trend,limits:result.limits};}
export function contributionCSV(result){return '\uFEFF'+[['segmento','base_COP','actual_COP','variacion_COP','contribucion_neta_pct','peso_cambio_bruto_pct'],...result.contributions.map(g=>[g.segment,g.base/100,g.current/100,g.delta/100,g.netContribution===null?'':g.netContribution*100,g.grossShare===null?'':g.grossShare*100])].map(r=>r.map(csvCell).join(',')).join('\r\n');}
