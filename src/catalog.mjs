import {escapeHTML as h} from './report.mjs';

export function catalogHTML(registry){
 return registry.list().map(({definition:d})=>`<article class="panel process-card"><div class="process-card-heading"><span class="eyebrow">PROCESO ESPECIALIZADO · ${h(d.version)}</span><span class="status-pill">${d.status==='available'?'Disponible':'No disponible'}</span></div><h2>${h(d.label)}</h2><p>${h(d.description)}</p><dl><dt>Objetivo</dt><dd>${h(d.objective)}</dd><dt>Dataset requerido</dt><dd>${h(d.dataset.format)} · ${h(d.dataset.description)}</dd></dl><details><summary>Ver las ${d.dataset.requiredColumns.length} columnas requeridas</summary><p class="process-columns">${d.dataset.requiredColumns.map(h).join(' · ')}</p></details><p class="small muted">Puedes consultar un corte. Las comparaciones y sus descargas requieren al menos ${d.dataset.comparisonMinPeriods} cortes.</p><button class="button primary" type="button" data-start-process="${h(d.id)}" ${d.status!=='available'?'disabled':''}>Iniciar análisis</button></article>`).join('');
}

export function createProcessLauncher({registry,document,onSelection=()=>{}}){
 const mounted=new Map();
 return async id=>{
  const process=registry.get(id);
  if(process.definition.status!=='available')throw new Error('Este proceso todavía no está disponible.');
  const view=document.getElementById(process.viewId);
  if(!view)throw new Error('No se encontró la interfaz del proceso.');
  // Cada vista se inicia una sola vez; volver al catálogo conserva filtros y datos.
  if(!mounted.has(id)){
   const pending=process.loadView().then(start=>start(process));
   mounted.set(id,pending);
   pending.catch(()=>mounted.delete(id));
  }
  await mounted.get(id);
  for(const other of registry.list()){
   const element=document.getElementById(other.viewId);if(element)element.hidden=other!==process;
  }
  onSelection(process.definition);
  return process;
 };
}
