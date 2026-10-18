import http from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {openLocalRequestDB} from './local-request-db.mjs';
const env={...process.env};
mkdirSync('.sites-local',{recursive:true});
env.DB=openLocalRequestDB('.sites-local/process-requests.sqlite');
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}
const server=http.createServer(async(req,res)=>{
 if(req.url==='/__qa/report'&&existsSync('evidence/informe_ejemplo.html')){res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(readFileSync('evidence/informe_ejemplo.html'));return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>5_100_000){res.writeHead(413).end();return;}}
 const url='http://127.0.0.1:4173'+req.url;
 const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}: {})});
 const response=await worker.fetch(request,env,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500).end('Error local.');}
});server.on('close',()=>env.DB.close());
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
