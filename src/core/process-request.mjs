export const REQUEST_LIMITS=Object.freeze({name:100,problem:2000,dataset:1000,expected:2000,email:254});
export function validateProcessRequest(input){
 const errors={},values={};
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,errors:{form:'Solicitud no válida.'}};
 const labels={name:'Nombre del proceso',problem:'Problema que resuelve',dataset:'Tipo de dataset',expected:'Resultados esperados'};
 for(const [field,label] of Object.entries(labels)){
  const value=typeof input[field]==='string'?input[field].trim():'';
  const min=field==='name'?3:10;
  if(value.length<min||value.length>REQUEST_LIMITS[field]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))errors[field]=`${label}: entre ${min} y ${REQUEST_LIMITS[field]} caracteres.`;
  values[field]=value;
 }
 const email=typeof input.email==='string'?input.email.trim():'';
 if((input.email!==undefined&&typeof input.email!=='string')||email.length>REQUEST_LIMITS.email||(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))errors.email='Introduce un correo válido o deja el campo vacío.';
 values.email=email;
 if(input.website)errors.form='No se pudo aceptar la solicitud.';
 return {ok:!Object.keys(errors).length,errors,values};
}
