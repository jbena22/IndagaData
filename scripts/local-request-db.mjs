import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

// Adaptador exclusivamente local. En Sites el mismo endpoint recibe env.DB (D1).
// Los datos quedan fuera de Git, en .sites-local/, nunca en el artefacto publicado.
export function openLocalRequestDB(path){
 const sqlite=new DatabaseSync(path);
 if(!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='process_requests'").get())sqlite.exec(readFileSync(new URL('../db/0000_process_requests.sql',import.meta.url),'utf8'));
 return {
  prepare(sql){return {bind(...values){return {async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};}};},
  close:()=>sqlite.close()
 };
}
