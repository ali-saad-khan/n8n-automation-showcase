#!/usr/bin/env bash
# Checks that every node type + typeVersion used exists in the node catalogue shipped in the n8n image.
set -uo pipefail
cd "$(dirname "$0")/.."
IMAGE="${N8N_IMAGE:-n8nio/n8n:latest}"
docker run --rm --entrypoint node -v "$PWD/workflows:/workflows:ro" "$IMAGE" -e '
const fs=require("fs"),path=require("path");
const pnpm="/usr/local/lib/node_modules/n8n/node_modules/.pnpm";
const dirs=fs.readdirSync(pnpm).filter(d=>/^(n8n-nodes-base|@n8n\+n8n-nodes-langchain)@/.test(d));
const cat={};
for(const d of dirs){
  const base=fs.readdirSync(pnpm+"/"+d+"/node_modules").length&&pnpm+"/"+d+"/node_modules";
  for(const p of ["n8n-nodes-base","@n8n/n8n-nodes-langchain"]){
    const f=`${base}/${p}/dist/types/nodes.json`;
    if(fs.existsSync(f)) for(const n of JSON.parse(fs.readFileSync(f,"utf8")).filter(Boolean)){const v=[].concat(n.version);if(!n.version&&!n.defaultVersion)console.log("NOVER",n.name);const k=p+"."+n.name;cat[k]=(cat[k]||[]).concat(v.filter(x=>x!==undefined)).concat(n.defaultVersion?[n.defaultVersion]:[]);}
  }
}
console.log("catalogue types:",Object.keys(cat).length);
let bad=0;
for(const f of fs.readdirSync("/workflows").filter(x=>x.endsWith(".json"))){
  const w=JSON.parse(fs.readFileSync("/workflows/"+f,"utf8"));
  for(const n of w.nodes){
    
    const vs=cat[n.type];
    if(!vs){console.log("UNKNOWN TYPE",f,n.name,n.type);bad++;}
    else if(!vs.includes(n.typeVersion)){console.log("UNKNOWN VERSION",f,n.name,n.type,n.typeVersion,"have",vs.join(","));bad++;}
  }
}
console.log(bad?"FAIL "+bad:"all node types/versions found in image catalogue");
process.exit(bad?1:0);
'
