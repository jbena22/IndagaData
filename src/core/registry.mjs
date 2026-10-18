// Contrato común. Cada proceso conserva su validación, cálculo y vista especializados.
export function createProcessRegistry(processes) {
 const entries=new Map();
 for(const process of processes){
  const d=process?.definition;
  if(!d||!['id','version','label','description','objective'].every(key=>typeof d[key]==='string'&&d[key].trim())||!['available','unavailable'].includes(d.status)||!d.dataset?.description||!Array.isArray(d.dataset.requiredColumns)||!d.dataset.requiredColumns.length)throw new TypeError('Definición de proceso incompleta.');
  if(entries.has(d.id))throw new Error('ID de proceso duplicado: '+d.id);
  if(!process.viewId||!['validate','analyse','loadView'].every(key=>typeof process[key]==='function'))throw new TypeError('El proceso requiere validación, análisis y vista propios.');
  entries.set(d.id,Object.freeze(process));
 }
 return Object.freeze({
  list:()=>Array.from(entries.values()),
  get(id){const process=entries.get(id);if(!process)throw new Error('Proceso no disponible: '+id);return process;}
 });
}
