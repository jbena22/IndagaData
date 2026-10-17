export function parseCSV(text,required=[]) {
 if(typeof text!=='string'||text.length>5_000_000) throw new Error('El CSV debe ocupar como máximo 5 MB.');
 text=text.replace(/^\uFEFF/,'');
 const delimiter=text.split(/\r?\n/,1)[0].includes(';')?';':',';
 const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++) {const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new Error('Comillas CSV mal formadas.');quoted=true;continue;}
  if(c===delimiter||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==delimiter){if(row.some(x=>x!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}continue;}
  if(closed)throw new Error('Contenido inesperado después de una celda entre comillas.');field+=c;
 }
 if(quoted)throw new Error('Comillas CSV sin cerrar.');row.push(field);if(row.some(x=>x!==''))rows.push(row);
 if(rows.length<2)throw new Error('El archivo no contiene registros.');
 if(rows.length>50001)throw new Error('Máximo 50.000 registros por archivo.');
 const headers=rows.shift().map(x=>x.trim());
 if(new Set(headers).size!==headers.length)throw new Error('Columnas duplicadas en la cabecera.');
 const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error('Faltan columnas: '+missing.join(', '));
 return {headers,records:rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`Fila CSV ${i+2}: ${r.length} celdas; se esperaban ${headers.length}.`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));})};
}
export function csvCell(v){const s=String(v??'');return '"'+(typeof v==='string'&&/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
