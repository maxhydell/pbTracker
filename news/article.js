(()=>{
"use strict";
const root=document.getElementById("article-page"),loading=document.getElementById("article-loading");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>{if(!v)return"";const d=new Date(v);return Number.isNaN(d.getTime())?"":new Intl.DateTimeFormat("en-US",{dateStyle:"medium"}).format(d);};
const slug=new URLSearchParams(location.search).get("slug")||"";
function author(a){const name=a.author_name||a.source_author;if(!name)return"";const avatar=a.author_name==="Max Hydell"?'<img class="article-author-avatar" src="/news/assets/max-hydell.jpg" alt="">':'<span class="article-author-avatar">'+esc(name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase())+'</span>';return '<div class="article-page-author">'+avatar+'<span><strong>'+esc(name)+'</strong></span></div>';}
function render(a){
  document.title=a.title+" | PBTRKR News";
  const body=a.body_html||("<p>"+esc(a.description||"")+"</p>");
  const source=a.source_url?'<p class="article-source-link-wrap"><a class="article-source-link" href="'+esc(a.source_url)+'" target="_blank" rel="noopener noreferrer">Read the original story on '+esc(a.source_name||"the source")+' ↗</a></p>':"";
  root.innerHTML='<div class="article-page-kicker"><span class="eyebrow-dot"></span> PBTRKR NEWS</div><div class="article-page-category">'+esc(a.category||"Pickleball")+'</div><h1>'+esc(a.title)+'</h1><p class="article-page-deck">'+esc(a.description||"")+'</p>'+(a.image_url?'<img class="article-page-hero" src="'+esc(a.image_url)+'" alt="'+esc(a.image_alt||a.title)+'">':"")+'<div class="article-page-byline"><time>'+esc(date(a.published_at||a.created_at))+'</time>'+(a.source_name?' <span>·</span> '+esc(a.source_name):"")+'</div>'+author(a)+'<div class="article-page-body">'+body+'</div>'+source;
  loading.classList.add("is-hidden");root.classList.remove("is-hidden");
}
async function load(){
  if(!slug){loading.textContent="This article could not be found.";return;}
  const fallback=(window.PBTRKR_NEWS_FALLBACK||[]).find(a=>a.slug===slug||a.id===slug);
  if(fallback)render(fallback);
  try{
    const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";script.async=true;
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("Database connection timed out")),6500);script.onload=()=>{clearTimeout(t);resolve();};script.onerror=()=>{clearTimeout(t);reject(new Error("Database client unavailable"));};document.head.appendChild(script);});
    const client=window.supabase.createClient("https://qyhzxfserrvsgutfhyel.supabase.co","sb_publishable_9J-0wsODGwFTa_EP2Ij7dw_jhw72TAg");
    const{data,error}=await client.from("news_articles").select("id,title,slug,description,image_url,image_alt,author_name,source_author,category,published_at,created_at,body_html,source_name,source_url").eq("status","published").eq("slug",slug).maybeSingle();
    if(error)throw error;
    if(data)render(data);else if(!fallback)throw new Error("Article not found");
  }catch(error){
    console.warn("Could not refresh article from database:",error);
    if(!fallback)loading.textContent="This article is unavailable right now. Return to all stories and try again.";
  }
}
load();
})();