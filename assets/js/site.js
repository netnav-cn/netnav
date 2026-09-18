
let NAV_DATA=[];
const BASE=document.body.dataset.base||'';
const overlay=document.querySelector('.search-overlay');
const input=document.querySelector('#global-search');
async function loadData(){if(NAV_DATA.length)return; const r=await fetch(BASE+'data/tools.json'); NAV_DATA=await r.json();}
async function openSearch(q=''){await loadData(); overlay.style.display='block'; input.value=q; input.focus(); renderResults(q);}
function closeSearch(){overlay.style.display='none'}
function renderResults(q){const box=document.querySelector('.results'); q=q.trim().toLowerCase(); if(!q){box.innerHTML='<div class="empty">输入工具名称、用途或分类，例如：DNS、测速、Ping、VPN。</div>';return;} const arr=NAV_DATA.filter(x=>(x.name+' '+x.desc+' '+x.category_name).toLowerCase().includes(q)).slice(0,30); box.innerHTML=arr.length?arr.map(x=>`<a class="result" href="${x.detail?(BASE+x.detail):x.url}" ${x.detail?'':'target="_blank" rel="noopener"'}><b>${x.name}</b><small>${x.category_name} · ${x.desc}</small></a>`).join(''):'<div class="empty">没找到完全匹配的工具，可以换个词试试。</div>';}
document.addEventListener('click',e=>{if(e.target.closest('[data-search]')){e.preventDefault();openSearch()} if(e.target.classList.contains('search-overlay'))closeSearch()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSearch(); if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openSearch();}});
if(input)input.addEventListener('input',e=>renderResults(e.target.value));
const home=document.querySelector('#home-search'); if(home)home.addEventListener('submit',e=>{e.preventDefault();openSearch(home.querySelector('input').value)});
