"""Oráculo independiente: uniones por ID y groupby; nunca modifica fuentes."""
import json
import pathlib
import subprocess
import argparse
from decimal import Decimal
import pandas as pd

root = pathlib.Path(__file__).resolve().parents[1]
metrics = ['SALDO_TOTAL', 'PROV_TOTAL', 'SALDO_MORA_30_MAS', 'SALDO_ALTO_RIESGO_CDE']
filters = [{}, {'PRODUCTO': 'VEHICULO'}, {'REGION': 'BOGOTA'}, {'PRODUCTO': 'VEHICULO', 'REGION': 'BOGOTA'}, {'REGION': 'NO_EXISTE'}]
js = """import {readFileSync} from 'node:fs';import {validateCSV,analyse,totals,DIMENSIONS,METRICS} from './src/engine.mjs';
const filters=[{},{PRODUCTO:'VEHICULO'},{REGION:'BOGOTA'},{PRODUCTO:'VEHICULO',REGION:'BOGOTA'},{REGION:'NO_EXISTE'}];const out={cases:[],monthly:{},segments:{}};
for(const file of ['data/demo.csv','tests/fixtures/population-movements.csv']){const v=validateCSV(readFileSync(file,'utf8'));if(!v.ok)throw Error('Invalid input');
for(let i=0;i<v.periods.length;i++)for(let j=i+1;j<v.periods.length;j++)for(const f of filters)for(const metric of Object.keys(METRICS)){const r=analyse(v.rows,{from:v.periods[i],to:v.periods[j],metric,filters:f});out.cases.push({file,from:r.from,to:r.to,metric,filters:f,bridge:r.populationBridge,migrations:r.ratingMigrations});}
if(file==='data/demo.csv')for(const period of v.periods){const rows=v.rows.filter(r=>r.FECHA_CORTE===period),select=rs=>Object.fromEntries(Object.keys(METRICS).map(k=>[k,totals(rs)[k]]));out.monthly[period]=select(rows);for(const dim of DIMENSIONS)for(const segment of new Set(rows.map(r=>r[dim])))out.segments[[period,dim,segment].join('|')]=select(rows.filter(r=>r[dim]===segment));}}
console.log(JSON.stringify(out));"""
actual = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=root, text=True, encoding='utf-8'))
frames = {}
for file in ['data/demo.csv', 'tests/fixtures/population-movements.csv']:
    p = pd.read_csv(root / file, dtype=str)
    for metric in metrics:
        p[metric] = p[metric].map(lambda value: int(Decimal(value) * 100))
    frames[file] = p

def total(frame, metric):
    return int(frame[metric].sum())

def side(count, base, current):
    return dict(count=int(count), base=int(base), current=int(current), delta=int(current-base))

for case in actual['cases']:
    p = frames[case['file']]
    for key, value in case['filters'].items():
        p = p[p[key].eq(value)]
    a = p[p.FECHA_CORTE.eq(case['from'])].set_index('ID_CREDITO')
    b = p[p.FECHA_CORTE.eq(case['to'])].set_index('ID_CREDITO')
    shared = a.index.intersection(b.index)
    entering, exiting = b.index.difference(a.index), a.index.difference(b.index)
    metric = case['metric']
    retained = side(len(shared), total(a.loc[shared], metric), total(b.loc[shared], metric))
    entered, exited = side(len(entering), 0, total(b.loc[entering], metric)), side(len(exiting), total(a.loc[exiting], metric), 0)
    delta = total(b, metric) - total(a, metric)
    expected_bridge = dict(metric=metric, retained=retained, entered=entered, exited=exited, delta=delta, reconciliation=retained['delta']+entered['delta']+exited['delta']-delta)
    assert case['bridge'] == expected_bridge, ('bridge', case['from'], case['filters'], metric)
    merged = a.loc[shared].merge(b.loc[shared], left_index=True, right_index=True, suffixes=('_base', '_current'))
    cells = []
    for (old, new), group in merged.groupby(['CALIFICACION_HOMOLOGADA_base', 'CALIFICACION_HOMOLOGADA_current']):
        base, current = int(group[metric+'_base'].sum()), int(group[metric+'_current'].sum())
        risk_base, risk_current = int(group.SALDO_ALTO_RIESGO_CDE_base.sum()), int(group.SALDO_ALTO_RIESGO_CDE_current.sum())
        cells.append(dict(from_=old, to=new, count=len(group), base=base, current=current, delta=current-base, riskBase=risk_base, riskCurrent=risk_current, riskDelta=risk_current-risk_base))
        cells[-1]['from'] = cells[-1].pop('from_')
    changed = int((merged.CALIFICACION_HOMOLOGADA_base != merged.CALIFICACION_HOMOLOGADA_current).sum())
    risk_base, risk_current = total(a.loc[shared], 'SALDO_ALTO_RIESGO_CDE'), total(b.loc[shared], 'SALDO_ALTO_RIESGO_CDE')
    expected_migrations = dict(metric=metric, retainedCount=len(shared), changedCount=changed, unchangedCount=len(shared)-changed, base=retained['base'], current=retained['current'], delta=retained['delta'], riskBase=risk_base, riskCurrent=risk_current, riskDelta=risk_current-risk_base, cells=cells, reconciliation=sum(c['delta'] for c in cells)-retained['delta'], riskReconciliation=sum(c['riskDelta'] for c in cells)-(risk_current-risk_base))
    assert case['migrations'] == expected_migrations, ('migrations', case['from'], case['filters'], metric)

p = frames['data/demo.csv']
monthly, segments = {}, {}
for period, group in p.groupby('FECHA_CORTE'):
    monthly[period] = {k: total(group, k) for k in metrics}
    for dim in ['PRODUCTO', 'REGION', 'CLASE_CARTERA', 'CALIFICACION_HOMOLOGADA', 'ESTADO_CREDITO']:
        for segment, subset in group.groupby(dim):
            segments['|'.join([period, dim, segment])] = {k: total(subset, k) for k in metrics}
assert actual['monthly'] == monthly
assert actual['segments'] == segments
result = dict(date=pd.Timestamp.now(tz='America/Bogota').date().isoformat(), status='passed', oracle='Independent pandas joins by credit ID and groupby; Decimal to integer cents', monthly_checks=len(monthly)*4, segment_checks=len(segments)*4, bridge_and_migration_cases=len(actual['cases']), source_files=list(frames), default_case=next(c for c in actual['cases'] if c['file']=='data/demo.csv' and c['from']=='2025-11-30' and c['to']=='2025-12-31' and not c['filters'] and c['metric']=='SALDO_TOTAL'))
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='evidence/variaciones_2026-10-15/pandas_movimientos.json')
target = root / parser.parse_args().output
target.parent.mkdir(parents=True, exist_ok=True)
with target.open('x', encoding='utf-8') as output:
    json.dump(result, output, indent=2, ensure_ascii=False)
print(json.dumps({k: v for k, v in result.items() if k != 'default_case'}))
