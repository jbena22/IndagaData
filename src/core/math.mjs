export function safeSum(a,b) { const n=a+b; if(!Number.isSafeInteger(n)) throw new Error('Importes fuera del rango de precisión admitido.'); return n; }
export function ratio(n,d) { return d===0?null:n/d; }
export function cents(value) {
 if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;
 const [a,b='']=value.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(n)?n:null;
}
