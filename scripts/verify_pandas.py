"""Independent oracle: pandas totals vs production JS engine, including every segment."""
import json, subprocess, pathlib, sys
import pandas as pd
root=pathlib.Path(__file__).resolve().parents[1]
p=pd.read_csv(root/'data/demo.csv')
metrics=['SALDO_TOTAL','PROV_TOTAL','SALDO_MORA_30_MAS','SALDO_ALTO_RIESGO_CDE']
dims=['PRODUCTO','REGION','CLASE_CARTERA','CALIFICACION_HOMOLOGADA','ESTADO_CREDITO']
expected={'monthly':{},'segments':{}}
for period,g in p.groupby('FECHA_CORTE'):
 expected['monthly'][period]={k:int(round(g[k].sum()*100)) for k in metrics}
 for dim in dims:
  for segment,sg in g.groupby(dim):
   expected['segments'][period+'|'+dim+'|'+segment]={k:int(round(sg[k].sum()*100)) for k in metrics}
js="""import {readFileSync} from 'node:fs';import {validateCSV,totals} from './src/engine.mjs';const v=validateCSV(readFileSync('data/demo.csv','utf8'));if(!v.ok)throw Error('invalid');const dims=['PRODUCTO','REGION','CLASE_CARTERA','CALIFICACION_HOMOLOGADA','ESTADO_CREDITO'];const keys=['SALDO_TOTAL','PROV_TOTAL','SALDO_MORA_30_MAS','SALDO_ALTO_RIESGO_CDE'];const select=rows=>Object.fromEntries(keys.map(k=>[k,totals(rows)[k]]));const out={monthly:{},segments:{}};for(const period of v.periods){const rows=v.rows.filter(r=>r.FECHA_CORTE===period);out.monthly[period]=select(rows);for(const dim of dims)for(const segment of new Set(rows.map(r=>r[dim])))out.segments[period+'|'+dim+'|'+segment]=select(rows.filter(r=>r[dim]===segment));}console.log(JSON.stringify(out));"""
actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=root,text=True))
assert actual==expected,'Production totals differ from independent pandas oracle'
assert p.SALDO_TOTAL.eq(p.SALDO_CAPITAL+p.SALDO_INTERES_CXC+p.SALDO_OTROS_INT).all()
assert p.PROV_TOTAL.eq(p.PROV_CAPITAL+p.PROV_CXC+p.PROV_INTERES).all()
assert p.SALDO_MORA_30_MAS.eq(p.SALDO_TOTAL.where(p.DIAS_MORA_CAPITAL>=30,0)).all()
assert p.SALDO_ALTO_RIESGO_CDE.eq(p.SALDO_TOTAL.where(p.CALIFICACION_HOMOLOGADA.isin(['C','D','E']),0)).all()
root.joinpath('evidence').mkdir(exist_ok=True)
result={'oracle':'pandas, independent groupby sums','rows':len(p),'periods':12,'monthly_checks':48,'segment_checks':len(expected['segments'])*4,'status':'passed','totals':expected['monthly']}
root.joinpath('evidence/pandas-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='totals'}))
