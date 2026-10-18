import {validateProcessRequest} from './core/process-request.mjs';

export function mountRequestForm(document,fetcher=fetch){
 const $=id=>document.getElementById(id);
 const form=$('process-request-form'),button=$('request-submit'),message=$('request-message');
 let available=false,busy=false;
 const sync=()=>{button.disabled=!available||busy;};
 const ready=fetcher('/api/process-requests/status').then(response=>{if(!response.ok)throw new Error();return response.json();}).then(status=>{
  available=status.available===true;
  $('request-availability').textContent=available?'Recepción privada disponible. No se envía correo automático.':'La recepción no está configurada. El formulario no puede enviar ni guardar solicitudes todavía.';
  sync();
 }).catch(()=>{$('request-availability').textContent='No se pudo comprobar el receptor. No se enviará ni guardará tu solicitud.';sync();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!available||busy)return;
  const values=Object.fromEntries(['name','problem','dataset','expected','email','website'].map(key=>[key,$('request-'+key).value]));
  const validation=validateProcessRequest(values);
  if(!validation.ok){message.textContent=Object.values(validation.errors).join(' ');return;}
  busy=true;sync();message.textContent='Enviando al receptor…';
  try{
   const response=await fetcher('/api/process-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(validation.values),signal:AbortSignal.timeout(15_000)});
   const result=await response.json();
   if(response.status!==201||!result.id||!result.receivedAt)throw new Error(result.error||'El receptor no confirmó el guardado.');
   message.textContent=result.message+' ID: '+result.id+' · '+result.receivedAt;
   form.reset();
  }catch(error){message.textContent=error.name==='TimeoutError'?'No se pudo confirmar la recepción a tiempo. El receptor podría haber guardado la solicitud; evita duplicarla.':error.message||'No se pudo confirmar la recepción.';}
  finally{busy=false;sync();}
 });
 return {ready};
}
