export {safeSum,ratio} from './core/math.mjs';
export {parseCSV} from './core/csv.mjs';
export * from './processes/banking.mjs';
import {PROCESS,validateCSV,analyse} from './processes/banking.mjs';
export const REGISTRY = {[PROCESS.id]:{definition:PROCESS,validate:validateCSV,analyse}};
