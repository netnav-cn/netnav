let NAV_DATA=[], GUIDE_DATA=[];
const BASE=document.body.dataset.base||'';
const overlay=document.querySelector('.search-overlay');
const input=document.querySelector('#global-search');
const results=document.querySelector('.results');
let activeIndex=-1;
let lastSearchTrigger=null;
let searchRequest=0;
let loadingPromise=null;
let activeSearchController=null;
let searchItems=[];
let isComposing=false;
let searchRenderFrame=0;
let searchDataReady=false;
let searchLoadFailed=false;
let reconnectWhenSettled=false;
const SEARCH_TIMEOUT_MS=10000;
function scheduleResults(query){
 if(searchRenderFrame)cancelAnimationFrame(searchRenderFrame);
 searchRenderFrame=requestAnimationFrame(()=>{searchRenderFrame=0;if(overlay?.style.display==='block'&&searchDataReady&&!isComposing)renderResults(input.value)});
}
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadData(){
 if(searchDataReady)return;
 if(loadingPromise)return loadingPromise;
 loadingPromise=(async()=>{
  if(navigator.onLine===false)throw new Error('search offline');
  const controller=new AbortController();
  activeSearchController=controller;
  const timeout=setTimeout(()=>controller.abort(new Error('search timeout')),SEARCH_TIMEOUT_MS);
  try{
   const responses=await Promise.all([fetch(BASE+'data/tools.json',{signal:controller.signal}),fetch(BASE+'data/guides.json',{signal:controller.signal})]);
   if(responses.some(r=>!r.ok))throw new Error('search index failed');
   const [toolsData,guidesData]=await Promise.all(responses.map(r=>r.json()));
   if(!Array.isArray(toolsData)||!Array.isArray(guidesData))throw new Error('invalid search index');
   const tools=toolsData.map(x=>({...x,kind:'工具',title:x.name,summary:x.desc,href:x.detail?BASE+x.detail:x.url,external:!x.detail}));
   const guides=guidesData.map(x=>({...x,kind:'指南',href:BASE+x.path,external:false}));
   const prepared=[...tools,...guides].map(x=>({...x,searchTitle:normalizedSearch(x.title),searchCategory:normalizedSearch(x.category_name),searchSummary:normalizedSearch(x.summary)}));
   NAV_DATA=toolsData;GUIDE_DATA=guidesData;searchItems=prepared;
   searchDataReady=true;searchLoadFailed=false;
  }finally{
   clearTimeout(timeout);
   if(activeSearchController===controller)activeSearchController=null;
  }
 })();
 try{await loadingPromise}finally{
  loadingPromise=null;
  if(reconnectWhenSettled){
   reconnectWhenSettled=false;
   if(!searchDataReady&&navigator.onLine!==false&&overlay?.style.display==='block'){
    queueMicrotask(()=>{if(!loadingPromise&&!searchDataReady&&navigator.onLine!==false&&overlay?.style.display==='block')ensureSearchData()});
   }
  }
 }
}
function showSearchError(){
 searchLoadFailed=true;
 const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
 const message=offline?'当前设备似乎已离线，请检查网络连接后重试。':'搜索数据加载失败或超时，请检查网络后重试。';
 results.innerHTML=`<div class="empty search-error" role="alert">${message}<button type="button" class="search-retry" data-search-retry>重试加载</button><span class="search-error-note">也可以通过分类或指南列表继续浏览。</span></div>`;
}
async function ensureSearchData(){
 if(searchDataReady){if(!isComposing)scheduleResults(input.value);return;}
 results.innerHTML='<div class="empty" role="status">正在加载搜索结果…</div>';
 const request=searchRequest;
 try{await loadData();if(request===searchRequest&&overlay.style.display==='block'&&!isComposing)scheduleResults(input.value)}
 catch(_){if(request===searchRequest&&overlay.style.display==='block')showSearchError()}
}
async function openSearch(q=''){
 if(!overlay||!input||!results)return;
 if(overlay.style.display==='block'){
  if(q){input.value=q;if(searchDataReady)scheduleResults(q)}
  input.focus();
  if(searchLoadFailed&&!loadingPromise)ensureSearchData();
  return;
 }
 lastSearchTrigger=document.activeElement;
 ++searchRequest;
 overlay.style.display='block';overlay.setAttribute('aria-hidden','false');
 document.body.classList.add('search-open');
 input.value=q;input.focus();
 ensureSearchData();
}
function closeSearch(){
 if(!overlay||overlay.style.display!=='block')return;
 ++searchRequest;
 overlay.style.display='none';overlay.setAttribute('aria-hidden','true');
 document.body.classList.remove('search-open');activeIndex=-1;
 if(searchRenderFrame){cancelAnimationFrame(searchRenderFrame);searchRenderFrame=0;}
 if(lastSearchTrigger?.isConnected&&typeof lastSearchTrigger.focus==='function')lastSearchTrigger.focus();
 else document.querySelector('[data-search]')?.focus();
}
const normalizedSearch=s=>String(s??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
function renderResults(query){
 const q=normalizedSearch(query),tokens=q.split(' ').filter(Boolean);
 activeIndex=-1;
 if(!tokens.length){results.scrollTop=0;results.innerHTML='<div class="empty" role="status">试试输入工具名、用途或指南问题，例如：DNS、丢包、Figma。</div>';return}
 const scored=searchItems.map(x=>{
  const title=x.searchTitle,category=x.searchCategory,desc=x.searchSummary;
  if(!tokens.every(t=>title.includes(t)||category.includes(t)||desc.includes(t)))return {...x,score:0};
  let score=0;
  if(title===q)score+=150;
  else if(title.startsWith(q))score+=90;
  else if(title.includes(q))score+=60;
  for(const token of tokens){
   if(title===token)score+=65;
   else if(title.startsWith(token))score+=42;
   else if(title.includes(token))score+=29;
   else if(category.includes(token))score+=15;
   else if(desc.includes(token))score+=7;
  }
  return {...x,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'zh-CN'));
 const shown=scored.slice(0,30);
 const count=`找到 ${scored.length} 条匹配结果${scored.length>30?'，显示前 30 条':''}`;
 results.scrollTop=0;
 results.innerHTML=shown.length?`<div class="empty" role="status">${count}</div>`+shown.map(x=>`<a class="result" href="${escapeHtml(x.href)}" ${x.external?'target="_blank" rel="noopener noreferrer"':''}><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.kind)} · ${escapeHtml(x.category_name||'实用指南')} · ${escapeHtml(x.summary)}</small></a>`).join(''):'<div class="empty" role="status">没有找到匹配结果。试试更短的词，或浏览分类和指南。</div>';
}

window.addEventListener('online',()=>{
 if(overlay?.style.display!=='block'||searchDataReady)return;
 if(loadingPromise){reconnectWhenSettled=true;return;}
 if(searchLoadFailed)ensureSearchData();
});
window.addEventListener('offline',()=>{
 if(searchDataReady)return;
 if(activeSearchController&&!activeSearchController.signal.aborted)activeSearchController.abort(new Error('search offline'));
 if(overlay?.style.display==='block')showSearchError();
});
document.addEventListener('click',e=>{if(e.target.closest('[data-search-retry]')){e.preventDefault();ensureSearchData();return;}if(e.target.closest('[data-search]')){e.preventDefault();openSearch()}if(e.target===overlay||e.target.closest('[data-search-close]'))closeSearch()});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!e.isComposing&&!isComposing&&overlay?.style.display==='block'){e.preventDefault();closeSearch();}
 if(!e.isComposing&&!isComposing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(overlay?.style.display==='block'){input?.focus()}else{openSearch()}}
 if(overlay?.style.display==='block'&&!e.isComposing&&!isComposing&&e.key==='Tab'){
  const focusable=[...overlay.querySelectorAll('input,button,a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length);
  if(focusable.length){const first=focusable[0],last=focusable[focusable.length-1];
   if(e.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement))){e.preventDefault();first.focus()}
  }
 }
 if(overlay?.style.display==='block'&&document.activeElement===input&&!e.isComposing&&!isComposing&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
  const links=[...results.querySelectorAll('a.result')];if(!links.length)return;
  e.preventDefault();activeIndex=e.key==='ArrowDown'?0:links.length-1;
  links[activeIndex].focus();
 }
});
if(results)results.addEventListener('keydown',e=>{
 if(!e.isComposing&&!isComposing&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
  const links=[...results.querySelectorAll('a.result')];if(!links.length)return;
  const current=links.indexOf(document.activeElement);if(current<0)return;
  e.preventDefault();
  if((e.key==='ArrowUp'&&current===0)||(e.key==='ArrowDown'&&current===links.length-1)){activeIndex=-1;input?.focus();return;}
  activeIndex=e.key==='Home'?0:e.key==='End'?links.length-1:current+(e.key==='ArrowDown'?1:-1);links[activeIndex].focus();
 }
});
if(input){
 input.addEventListener('compositionstart',()=>{isComposing=true;if(searchRenderFrame){cancelAnimationFrame(searchRenderFrame);searchRenderFrame=0;}});
 input.addEventListener('compositionend',()=>{isComposing=false;scheduleResults(input.value)});
 input.addEventListener('input',e=>{if(!isComposing&&!e.isComposing){if(searchDataReady)scheduleResults(e.target.value);else if(searchLoadFailed&&!loadingPromise)ensureSearchData();}});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!isComposing){const first=results.querySelector('a.result');if(first){e.preventDefault();first.click()}}});
}
const home=document.querySelector('#home-search');if(home)home.addEventListener('submit',e=>{e.preventDefault();openSearch(home.querySelector('input').value)});

// Google Analytics 4
(function(){
  const gaScript=document.createElement('script');
  gaScript.async=true;
  gaScript.src='https://www.googletagmanager.com/gtag/js?id=G-H4C20T8RZZ';
  document.head.appendChild(gaScript);

  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());
  window.gtag('config','G-H4C20T8RZZ');
})();

// Filter cards on the current category page, including cards separated by ads.
(function(){
 const field=document.querySelector('[data-category-filter]');
 if(!field)return;
 const cards=[...document.querySelectorAll('main .tool-card')];
 const status=document.querySelector('[data-filter-status]');
 // Keep the empty state near the filter, not among the grid's cards or ads.
 const empty=document.createElement('p');
 empty.className='category-filter-empty';
 empty.hidden=true;
 empty.setAttribute('role','status');
 empty.textContent='没有找到匹配工具。试试缩短关键词，或清空筛选查看本分类全部工具。';
 const filterBox=field.closest('.category-filter');
 if(filterBox)filterBox.appendChild(empty);
 const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
 const index=cards.map(c=>normalize(c.textContent));
 let filterComposing=false;
 function update(){
  const tokens=normalize(field.value).split(' ').filter(Boolean);let visible=0;
  cards.forEach((card,i)=>{const ok=tokens.every(t=>index[i].includes(t));card.hidden=!ok;if(ok)visible++});
  if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent=tokens.length?`找到 ${visible} 个匹配工具（本分类共 ${cards.length} 个）`:`本分类共 ${cards.length} 个工具`;}
  empty.hidden=!(tokens.length&&visible===0);
 }
 field.addEventListener('compositionstart',()=>{filterComposing=true});
 field.addEventListener('compositionend',()=>{filterComposing=false;update()});
 field.addEventListener('input',e=>{if(!filterComposing&&!e.isComposing)update()});
 field.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&!filterComposing&&field.value){e.preventDefault();field.value='';update();field.focus();}});
 document.querySelector('[data-filter-clear]')?.addEventListener('click',()=>{field.value='';update();field.focus()});
 update();
})();
