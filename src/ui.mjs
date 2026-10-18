import {processRegistry} from './processes/index.mjs';
import {catalogHTML,createProcessLauncher} from './catalog.mjs';
import {mountRequestForm} from './requests-ui.mjs';
import {escapeHTML as h} from './report.mjs';

const $=id=>document.getElementById(id);
$('process-catalog').innerHTML=catalogHTML(processRegistry);
$('process-navigation').innerHTML=processRegistry.list().filter(process=>process.definition.status==='available').map(process=>(process.navigation??[]).map(link=>`<a href="#${h(link.target)}" data-analysis-link data-process-id="${h(process.definition.id)}">${h(link.icon)} <span>${h(link.label)}</span></a>`).join('')).join('');
const launch=createProcessLauncher({registry:processRegistry,document,onSelection:definition=>{
 $('selected-process').textContent=definition.label;
 $('side-process-name').textContent=definition.label+' · '+definition.version;
 $('catalog-message').textContent='Proceso activo: '+definition.label+'.';
}});
async function start(id,target){
 try{const process=await launch(id);document.getElementById(target||process.viewId)?.scrollIntoView({behavior:'smooth',block:'start'});}
 catch(error){$('catalog-message').textContent='No se pudo iniciar el análisis. '+error.message;}
}
document.querySelectorAll('[data-start-process]').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;await start(button.dataset.startProcess);button.disabled=false;
}));
const analysisLinks=[...document.querySelectorAll('[data-analysis-link]')];
analysisLinks.forEach(link=>link.addEventListener('click',()=>{
 start(link.dataset.processId,link.hash.slice(1));
}));
// Conserva los enlaces directos existentes al análisis bancario.
const linked=analysisLinks.find(link=>link.hash===location.hash);
if(linked)start(linked.dataset.processId,linked.hash.slice(1));
mountRequestForm(document);
