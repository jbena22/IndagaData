"""Contrasta observaciones de navegador real con el CSV original usando pandas."""
import hashlib
import json
import pathlib
import argparse
from decimal import Decimal
import pandas as pd

root = pathlib.Path(__file__).resolve().parents[1]
folder = root / 'evidence/variaciones_2026-10-15'
observed = json.loads((folder / 'navegador.json').read_text(encoding='utf-8'))
metrics = ['SALDO_TOTAL', 'PROV_TOTAL', 'SALDO_MORA_30_MAS', 'SALDO_ALTO_RIESGO_CDE']
source = root.parent / 'dataset_bancario_1_cartera_mensual.csv'
assert source.read_bytes() == (root / 'data/demo.csv').read_bytes()
frames = {}
for label, path in [('original', source), ('sample', root / 'tests/fixtures/population-movements.csv')]:
    p = pd.read_csv(path, dtype=str)
    for metric in metrics:
        p[metric] = p[metric].map(lambda value: int(Decimal(value)*100))
    frames[label] = p

def cents(value):
    return int(Decimal(value.removesuffix(' COP').replace('.', '').replace(',', '.'))*100)

kpi_checks, bridge_checks, migration_checks = 0, 0, 0
for case in observed['checks']:
    p = frames['sample' if case['label']=='muestra_entradas_salidas' else 'original']
    for key, field in [('product', 'PRODUCTO'), ('region', 'REGION')]:
        if case[key]:
            p = p[p[field].eq(case[key])]
    base, current = p[p.FECHA_CORTE.eq(case['from'])].set_index('ID_CREDITO'), p[p.FECHA_CORTE.eq(case['to'])].set_index('ID_CREDITO')
    for metric, rendered in zip(metrics, case['kpis'], strict=True):
        assert cents(rendered) == int(current[metric].sum()), (case['label'], metric)
        kpi_checks += 1
    assert not case['overflow']
    if case['from']==case['to']:
        assert case['populationHidden'] and not case['bridgeRows'] and not case['migrationRows']
        assert all(case['exportsDisabled']) and '1 corte disponible' in case['subtitle']
        continue
    assert not case['populationHidden'] and 'Diferencia cero' in case['reconciliation']
    shared = base.index.intersection(current.index)
    entered, exited = current.index.difference(base.index), base.index.difference(current.index)
    metric = case['metric']
    amounts = [(len(shared), int(base.loc[shared][metric].sum()), int(current.loc[shared][metric].sum())), (len(entered), 0, int(current.loc[entered][metric].sum())), (len(exited), int(base.loc[exited][metric].sum()), 0)]
    for rendered, (count, old, new) in zip(case['bridgeRows'], amounts, strict=True):
        assert int(rendered[1]) == count
        assert [cents(x) for x in rendered[2:]] == [old, new, new-old]
        bridge_checks += 4
    merged = base.loc[shared].merge(current.loc[shared], left_index=True, right_index=True, suffixes=('_base', '_current'))
    groups = list(merged.groupby(['CALIFICACION_HOMOLOGADA_base', 'CALIFICACION_HOMOLOGADA_current']))
    for rendered, ((old_rating, new_rating), group) in zip(case['migrationRows'], groups, strict=True):
        assert rendered[0] == old_rating+' → '+new_rating
        assert int(rendered[1]) == len(group)
        old, new = int(group[metric+'_base'].sum()), int(group[metric+'_current'].sum())
        risk_old, risk_new = int(group.SALDO_ALTO_RIESGO_CDE_base.sum()), int(group.SALDO_ALTO_RIESGO_CDE_current.sum())
        assert [cents(x) for x in rendered[2:]] == [old, new, new-old, risk_old, risk_new, risk_new-risk_old]
        migration_checks += 7

csv_path = folder / 'descarga_contribuciones.csv'
assert csv_path.read_bytes() == (root.parent / 'auditoria_importes/csv_publicado_v2.csv').read_bytes()
downloaded = pd.read_csv(csv_path)
assert pd.api.types.is_numeric_dtype(downloaded.variacion_COP)
assert downloaded.variacion_COP.lt(0).all() and int(downloaded.variacion_COP.sum()) == -715859081
evidence = json.loads((folder / 'descarga_evidencia.json').read_text(encoding='utf-8'))
assert evidence['metadata']['sha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
assert evidence['evidence']['populationBridge']['retained']['delta'] == -71585908100
assert evidence['evidence']['ratingMigrations']['changedCount'] == 318
assert not observed['consoleErrors']
result = dict(date='2026-10-15', status='passed', browser_states=len(observed['checks']), kpi_checks=kpi_checks, bridge_values_checked=bridge_checks, migration_values_checked=migration_checks, javascript_errors_observed=0, csv_numeric_negatives=len(downloaded), csv_byte_equal_to_public_v2=True, csv_sha256=hashlib.sha256(csv_path.read_bytes()).hexdigest(), source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(), html_and_json_real_downloads_verified=True, original_dataset_unchanged=True, deployment_performed=False)
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='evidence/variaciones_2026-10-15/verificacion_navegador.json')
target = root / parser.parse_args().output
target.parent.mkdir(parents=True, exist_ok=True)
with target.open('x', encoding='utf-8') as output:
    json.dump(result, output, indent=2)
print(json.dumps(result))
