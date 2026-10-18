import {createProcessRegistry} from '../core/registry.mjs';
import {bankingProcess} from './banking-definition.mjs';

// Único punto de alta: el catálogo y la selección consumen este mismo registro.
export const processRegistry=createProcessRegistry([bankingProcess]);
export const REGISTRY=Object.freeze(Object.fromEntries(processRegistry.list().map(process=>[process.definition.id,process])));
