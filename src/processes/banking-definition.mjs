import {PROCESS,REQUIRED,METRICS,DIMENSIONS,validateCSV,analyse,totals,contributionCSV,publicEvidence} from './banking.mjs';

export const bankingProcess=Object.freeze({
 definition:Object.freeze({...PROCESS,
  description:'Investiga la evolución de una cartera bancaria mensual con cálculos verificables.',
  objective:'Cuantificar cambios en saldo, provisiones, mora y exposición C/D/E; localizar aportes por segmento y contrastar población y calificaciones.',
  status:'available',
  dataset:Object.freeze({format:'CSV UTF-8',description:'Un crédito por corte de fin de mes. Importes en COP, sin separadores de miles y con punto decimal. Requiere las 24 columnas del contrato bancario.',requiredColumns:Object.freeze([...REQUIRED]),maxBytes:5_000_000,minPeriods:1,comparisonMinPeriods:2}),
 }),
 viewId:'banking-workspace',
 navigation:Object.freeze([{target:'overview',label:PROCESS.label,icon:'◈'},{target:'investigation',label:'Investigar variaciones',icon:'↗'},{target:'quality',label:'Calidad y evidencia',icon:'✓'},{target:'assistant',label:'Consultar con Gemini',icon:'✧'}]),
 metrics:METRICS,dimensions:DIMENSIONS,
 validate:validateCSV,analyse,totals,exportCSV:contributionCSV,publicEvidence,
 loadView:()=>import('./banking-ui.mjs').then(module=>module.startBanking)
});
