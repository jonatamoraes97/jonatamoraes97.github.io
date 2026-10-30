(() => {
'use strict';
const DATA=window.PORTFOLIO_DATA;
if(!DATA)return;
const scriptBase=new URL('.',document.currentScript.src);
const asset=path=>new URL(path,scriptBase).href;
const $=sel=>document.querySelector(sel);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
const projects=new Map(DATA.projects.map(p=>[p.name,p]));
const files=new Map();
const pendingFiles=new Map();
const liveFiles=new Set();
let active=null, viewSequence=0;
const modal=$('#project-dialog');
const tabs=[...document.querySelectorAll('.modal-tab')];
const panels=[...document.querySelectorAll('[data-panel]')];
let activeTab='overview';
const aliases={bia:'assistente-virtual-financeiro-DIO',etl:'ETL-de-vendas-python'};
function getProject(key){return projects.get(aliases[key]||key)}
function titleFor(name){return name.replace(/[-_]/g,' ')}
function rawUrl(p,path){return 'https://raw.githubusercontent.com/'+DATA.owner+'/'+encodeURIComponent(p.name)+'/'+encodeURIComponent(p.default_branch)+'/'+path.split('/').map(encodeURIComponent).join('/')}
function repoUrl(p,path=''){return 'https://github.com/'+DATA.owner+'/'+encodeURIComponent(p.name)+(path?'/blob/'+encodeURIComponent(p.default_branch)+'/'+path.split('/').map(encodeURIComponent).join('/'):'')}
function setStatus(text){$('#github-status').textContent=text}
async function requestJSON(url){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);try{const r=await fetch(url,{signal:controller.signal,headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw new Error('GitHub '+r.status);return await r.json()}finally{clearTimeout(timer)}}
async function getFile(p,path){
 const key=p.name+'/'+path;
 if(liveFiles.has(key))return {content:files.get(key),saved:false};
 if(pendingFiles.has(key))return pendingFiles.get(key);
 const promise=(async()=>{
  try{
   const response=await requestJSON('https://api.github.com/repos/'+DATA.owner+'/'+encodeURIComponent(p.name)+'/contents/'+path.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(p.default_branch));
   if(response.type!=='file'||response.encoding!=='base64'||response.size>600000)throw new Error('Unsupported file');
   const bytes=Uint8Array.from(atob(response.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
   const text=new TextDecoder('utf-8').decode(bytes);files.set(key,text);liveFiles.add(key);
   return {content:text,saved:false};
  }catch(error){
   if(p.files&&Object.hasOwn(p.files,path))return {content:p.files[path].content,saved:true};
   throw error;
  }finally{pendingFiles.delete(key)}
 })();pendingFiles.set(key,promise);return promise;
}
function safeCodePaths(p){return (p.tree||[]).filter(f=>/\.(py|js|ts|html|css|sql|csv|txt)$/i.test(f.path)&&!/(^|\/)(node_modules|\.git|__pycache__|\.venv|venv|samples)(\/|$)/.test(f.path)&&!/(secret|credential|token|\.env)/i.test(f.path)&&f.size<600000).map(f=>f.path)}
async function ensureTree(p){
 if(p.tree?.length)return;
 try{const r=await requestJSON('https://api.github.com/repos/'+DATA.owner+'/'+encodeURIComponent(p.name)+'/git/trees/'+encodeURIComponent(p.default_branch)+'?recursive=1');p.tree=(r.tree||[]).filter(f=>f.type==='blob').map(f=>({path:f.path,size:f.size}));}catch{}
}
function renderCatalog(){
 const query=$('#project-search').value.trim().toLocaleLowerCase('pt-BR');
 const grid=$('#repo-grid');grid.replaceChildren();
 const matches=[...projects.values()].filter(p=>[p.title,p.name,p.description,...(p.tags||[])].join(' ').toLocaleLowerCase('pt-BR').includes(query));
 $('#catalog-count').textContent=matches.length+' projeto'+(matches.length===1?'':'s');
 for(const p of matches){
  const button=el('button','repo-card');button.type='button';button.dataset.open=p.name;
  button.setAttribute('aria-label','Explorar '+p.title+' dentro do portfólio');
  button.append(el('h4','',p.title),el('p','',p.description));
  const bottom=el('span','repo-card-bottom');bottom.append(el('span','',(p.tags||[]).slice(0,3).join(' · ')||p.language||'Projeto'),el('span','','Explorar ↗'));button.append(bottom);grid.append(button);
 }
 if(!matches.length)grid.append(el('p','empty-state','Nenhum projeto encontrado. Tente outro nome ou tecnologia.'));
}
async function refreshProjects(){
 try{
  let repos=[],page=1;
  while(page<=10){const batch=await requestJSON('https://api.github.com/users/'+DATA.owner+'/repos?type=owner&sort=updated&per_page=100&page='+page);if(!Array.isArray(batch))throw new Error('Invalid response');repos.push(...batch);if(batch.length<100)break;page++}
  repos=repos.filter(r=>!r.private&&!r.fork&&r.name!==DATA.owner&&r.name!==DATA.owner+'.github.io'&&r.owner?.login.toLowerCase()===DATA.owner);
  if(!repos.length&&DATA.projects.length)throw new Error('Empty repository response');
  const next=new Map();
  for(const r of repos){
   const saved=projects.get(r.name);
   next.set(r.name,saved?{...saved,default_branch:r.default_branch,updated_at:r.updated_at,archived:r.archived}:{name:r.name,title:titleFor(r.name),description:r.description||'Explore a documentação e os arquivos deste projeto.',default_branch:r.default_branch,tags:r.language?[r.language]:[],language:r.language,tree:[],files:{},updated_at:r.updated_at,archived:r.archived});
  }
  projects.clear();for(const [key,value] of next)projects.set(key,value);
  renderCatalog();setStatus('GitHub · '+projects.size+' projetos públicos · atualizado agora');
 }catch{setStatus(DATA.projects.length+' projetos · exibindo a versão salva do GitHub')}
}
const allowedTags=new Set(['A','P','H1','H2','H3','H4','H5','H6','UL','OL','LI','STRONG','EM','DEL','PRE','CODE','BLOCKQUOTE','BR','HR','TABLE','THEAD','TBODY','TR','TH','TD','IMG','DETAILS','SUMMARY','SPAN','DIV','SUP','SUB']);
const droppedTags=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','LINK','META','SVG','MATH']);
function repoPath(href,current='README.md'){
 const base='https://repository.invalid/'+current;
 const resolved=new URL(href,base);
 if(resolved.origin!=='https://repository.invalid')return null;
 return decodeURIComponent(resolved.pathname.slice(1));
}
function renderMarkdown(markdown,p,current='README.md'){
 const safeText=markdown.replaceAll('jonata.moraes@gmail.com','Contato por e-mail').replaceAll('(48) 99807-7278','Contato por telefone').replaceAll('48 998077278','Contato por telefone');
 const html=window.marked.parse(safeText,{gfm:true,breaks:false});
 const parsed=new DOMParser().parseFromString(html,'text/html');
 const fragment=document.createDocumentFragment();
 function copy(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE||droppedTags.has(node.tagName))return document.createDocumentFragment();
  const target=allowedTags.has(node.tagName)?el(node.tagName.toLowerCase()):document.createDocumentFragment();
  if(node.tagName==='A'&&target.nodeType===Node.ELEMENT_NODE){
   const href=node.getAttribute('href')||'';
   try{
    const url=new URL(href,'https://repository.invalid/'+current);
    if(url.origin==='https://repository.invalid'){
     const path=repoPath(href,current);
     if(path&&/\.(md|py|js|ts|html|css|sql|csv|txt)$/i.test(path)){target.href=repoUrl(p,path);target.dataset.projectFile=path}
     else if(href.startsWith('#'))target.href='#';
     else{target.href=repoUrl(p,path||'');target.target='_blank';target.rel='noopener noreferrer'}
    }else if(['https:','http:','mailto:'].includes(url.protocol)){target.href=url.href;target.target='_blank';target.rel='noopener noreferrer'}
   }catch{}
  }
  if(node.tagName==='IMG'&&target.nodeType===Node.ELEMENT_NODE){
   const source=node.getAttribute('src')||'';
   try{
    const url=new URL(source,'https://repository.invalid/'+current);
    const path=repoPath(source,current);
    const src=path?(p.assets?.[path]?asset(p.assets[path]):rawUrl(p,path)):url.href;
    if(new URL(src).protocol==='https:'||src.startsWith(scriptBase.href)){target.src=src;target.alt=node.getAttribute('alt')||'Imagem do projeto';target.loading='lazy';target.referrerPolicy='no-referrer';target.addEventListener('error',()=>{target.replaceWith(el('p','image-unavailable','Imagem indisponível nesta prévia.'))},{once:true})}
    else return document.createDocumentFragment();
   }catch{return document.createDocumentFragment()}
  }
  for(const child of node.childNodes)target.append(copy(child));
  if(node.tagName==='TABLE'&&target.nodeType===Node.ELEMENT_NODE){const wrap=el('div','table-scroll');wrap.append(target);return wrap}
  return target;
 }
 for(const node of parsed.body.childNodes)fragment.append(copy(node));
 return fragment;
}
function imageFigure(p){
 const figure=el('figure','overview-media');
 const img=el('img');img.src=asset(p.preview.src);img.alt=p.preview.alt;img.loading='eager';
 img.addEventListener('error',()=>{img.replaceWith(el('p','image-unavailable','A imagem do projeto não pôde ser carregada. A documentação está disponível na próxima aba.'))},{once:true});
 figure.append(img,el('figcaption','',p.preview.caption));return figure;
}
function showOverview(p,panel){
 panel.replaceChildren();
 const wrap=el('div','project-overview');
 if(p.preview?.src)wrap.append(imageFigure(p));
 else if(p.name==='ETL-de-vendas-python'){
  const flow=el('div','overview-flow');const sample=$('.cover-two .pipeline').cloneNode(true);sample.removeAttribute('aria-hidden');flow.append(sample,el('p','reader-note','Fluxo descrito no repositório: extração, tratamento e carga.'));wrap.append(flow);
 }
 const detail=el('div','overview-detail'+(!p.preview&&!p.name.startsWith('ETL-')?' overview-full':''));
 detail.append(el('h3','',p.overviewTitle||'Sobre este projeto'),el('p','',p.description));
 if(p.highlights?.length){const list=el('ul');for(const item of p.highlights)list.append(el('li','',item));detail.append(list)}
 const tags=el('div','tags');for(const tag of p.tags||[])tags.append(el('span','tag',tag));detail.append(tags);
 if(p.demo){const button=el('button','button','Abrir demonstração ↗');button.type='button';button.addEventListener('click',()=>selectTab('demo'));detail.append(button)}
 else detail.append(el('p','reader-note',p.preview?'Imagem real do projeto. Consulte a documentação para conhecer a execução.':'Explore a documentação e o código nas abas acima.'));
 wrap.append(detail);panel.append(wrap);
}
function state(panel,message,retry){
 panel.replaceChildren();const box=el('div','reader-state',message);
 if(retry){const button=el('button','button secondary','Tentar novamente');button.type='button';button.addEventListener('click',retry);box.append(button)}
 panel.append(box);
}
async function showDocs(p,panel,path='README.md',token=viewSequence){
 if(path==='README.md'&&p.tree?.length){
  const readme=p.tree.find(file=>/^readme(?:\.(?:md|markdown|txt|rst))?$/i.test(file.path));
  if(readme)path=readme.path;
  else{state(panel,'Este repositório ainda não possui README. Explore os arquivos disponíveis na aba Código ou consulte o repositório.');return}
 }
 state(panel,'Carregando documentação…');
 try{
  const source=await getFile(p,path);if(token!==viewSequence||active?.name!==p.name)return;
  panel.replaceChildren();
  const head=el('div','reader-header');head.append(el('span','',path));
  if(path!=='README.md'){const back=el('button','reader-back','← Voltar ao README');back.type='button';back.addEventListener('click',()=>showDocs(p,panel,'README.md',++viewSequence));head.append(back)}
  const note=source.saved?'Versão salva do repositório':'Conteúdo do GitHub';
  head.append(el('span','',note));panel.append(head);
  if(!source.content.trim()){panel.append(el('p','reader-state','Este arquivo ainda não possui conteúdo.'));return}
  const content=el('div','markdown');content.append(renderMarkdown(source.content,p,path));panel.append(content);
 }catch{if(token!==viewSequence)return;state(panel,'Este arquivo não está disponível agora. Você pode explorar as outras abas ou tentar novamente.',()=>showDocs(p,panel,path,++viewSequence))}
}
async function showCode(p,panel,requested,token=viewSequence){
 await ensureTree(p);if(token!==viewSequence||active?.name!==p.name)return;
 const paths=safeCodePaths(p);
 const selected=requested||p.codePath||paths.find(path=>path==='main.py')||paths[0];
 if(selected&&!paths.includes(selected))paths.unshift(selected);
 if(!selected){state(panel,'Este repositório não possui arquivos de código disponíveis para leitura aqui. Consulte a documentação ou o repositório.');return}
 panel.replaceChildren();const toolbar=el('div','code-toolbar');const label=el('label','','ARQUIVO');label.htmlFor='code-file';
 const select=el('select','code-select');select.id='code-file';
 for(const path of paths){const option=el('option','',path);option.value=path;select.append(option)}select.value=selected;
 label.append(select);toolbar.append(label);const origin=el('span','reader-note','Somente leitura');toolbar.append(origin);panel.append(toolbar);
 const pre=el('pre','source-code','Carregando código…');pre.tabIndex=0;pre.setAttribute('aria-label','Código-fonte do projeto');panel.append(pre);
 select.addEventListener('change',()=>showCode(p,panel,select.value,++viewSequence));
 try{const source=await getFile(p,selected);if(token!==viewSequence||active?.name!==p.name)return;pre.textContent=source.content||'// Este arquivo ainda está vazio.';origin.textContent=source.saved?'Versão salva · somente leitura':'GitHub · somente leitura'}
 catch{if(token!==viewSequence)return;pre.textContent='Não foi possível carregar este arquivo. Escolha outro arquivo ou tente novamente.'}
}
function showDemo(p,panel){
 panel.replaceChildren();if(!p.demo){state(panel,'Não há demonstração publicada para este projeto.');return}
 const box=el('div','demo-intro');const copy=el('div');copy.append(el('h3','','Conheça o '+p.title),el('p','','A demonstração publicada abre aqui, dentro do portfólio. Você pode navegar pelas telas do projeto.'));
 const button=el('button','button','Carregar demonstração');button.type='button';box.append(copy,button);panel.append(box);
 button.addEventListener('click',()=>{
  button.disabled=true;button.textContent='Demonstração aberta';
  const message=el('p','demo-help','Carregando demonstração…');message.setAttribute('role','status');
  const frame=el('iframe','demo-frame');frame.title='Demonstração de '+p.title;frame.sandbox='allow-scripts allow-forms allow-same-origin';frame.referrerPolicy='no-referrer';frame.src=p.demo;
  const fallback=el('p','demo-help');fallback.append(document.createTextNode('Se preferir, '));const link=el('a','text-link','abrir a demonstração em outra aba ↗');link.href=p.demo;link.target='_blank';link.rel='noopener noreferrer';fallback.append(link);
  const timeout=setTimeout(()=>{message.textContent='Se a demonstração não aparecer, tente abrir pelo link abaixo.'},14000);
  frame.addEventListener('load',()=>{clearTimeout(timeout);message.textContent='Demonstração do projeto · navegue pelas telas abaixo.'},{once:true});
  panel.append(message,frame,fallback);
 },{once:true});
}
function selectTab(key){
 if(!active)return;
 modal.scrollTop=0;activeTab=key;const token=++viewSequence;
 for(const tab of tabs){const chosen=tab.dataset.tab===key;tab.setAttribute('aria-selected',String(chosen));tab.tabIndex=chosen?0:-1}
 for(const panel of panels)panel.hidden=panel.dataset.panel!==key;
 const panel=$('[data-panel="'+key+'"]');
 if(key==='overview')showOverview(active,panel);
 else if(key==='docs')showDocs(active,panel,'README.md',token);
 else if(key==='code')showCode(active,panel,undefined,token);
 else if(key==='demo')showDemo(active,panel);
}
async function openProject(key){
 const p=getProject(key);if(!p)return;
 active=p;++viewSequence;
 $('#dialog-title').textContent=p.title;$('#dialog-type').textContent=(p.tags||[]).join(' / ');
 $('#dialog-summary').textContent=p.description;$('#repo-link').href=repoUrl(p);
 $('#tab-demo').hidden=!p.demo;$('#tab-code').hidden=!safeCodePaths(p).length&&!p.codePath&&p.tree?.length>0;
 $('#dialog-source').textContent='GITHUB / '+DATA.owner;
 selectTab('overview');
 if(!modal.open)modal.showModal();
 $('.close').focus();
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-open]');
 if(button){openProject(button.dataset.open);return}
 const link=event.target.closest('[data-project-file]');
 if(link&&active){event.preventDefault();const path=link.dataset.projectFile;
  if(path.endsWith('.md')){selectTab('docs');showDocs(active,$('[data-panel="docs"]'),path,++viewSequence)}
  else{selectTab('code');showCode(active,$('[data-panel="code"]'),path,++viewSequence)}
 }
});
tabs.forEach(tab=>{
 tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
 tab.addEventListener('keydown',event=>{
  const visible=tabs.filter(t=>!t.hidden);const index=visible.indexOf(tab);let next;
  if(event.key==='ArrowRight')next=(index+1)%visible.length;
  else if(event.key==='ArrowLeft')next=(index-1+visible.length)%visible.length;
  else if(event.key==='Home')next=0;else if(event.key==='End')next=visible.length-1;else return;
  event.preventDefault();selectTab(visible[next].dataset.tab);visible[next].focus();
 });
});
$('.close').addEventListener('click',()=>modal.close());
modal.addEventListener('close',()=>{++viewSequence;active=null;for(const panel of panels)panel.replaceChildren()});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close()}});
$('#catalog-toggle').addEventListener('click',()=>{
 const button=$('#catalog-toggle');const expanded=button.getAttribute('aria-expanded')==='true';
 button.setAttribute('aria-expanded',String(!expanded));$('#project-catalog').hidden=expanded;button.textContent=expanded?'Explorar todos os projetos ↗':'Recolher projetos ↑';
 if(!expanded){renderCatalog();$('#project-search').focus({preventScroll:true})}
});
$('#project-search').addEventListener('input',renderCatalog);
for(const img of document.querySelectorAll('.cover-shot')){img.src=asset(img.dataset.asset);img.addEventListener('error',()=>{img.hidden=true;img.parentElement.append(el('span','image-unavailable','BIA Finance · imagem indisponível'))},{once:true})}
renderCatalog();setStatus('GitHub · '+projects.size+' projetos públicos');
refreshProjects();
const initial=new URLSearchParams(location.search).get('projeto');if(initial)openProject(initial);
})();
