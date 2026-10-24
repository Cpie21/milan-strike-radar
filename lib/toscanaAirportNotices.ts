import { SOURCE_USER_AGENT } from './sourceRequest';
import * as cheerio from 'cheerio';
const origin='https://www.toscana-aeroporti.com';
const endpoint=origin+'/console/graphql';
const listQuery='query GetArticles($langcode:String,$page:Int,$pageSize:Int){articlesViewList(filter:{langcode:$langcode},page:$page,pageSize:$pageSize){results{... on NodeArticle{id title path created{time}}} pageInfo{page pageSize total}}}';
const detailQuery='query GetArticle($slug:String!,$langcode:String){route(path:$slug,langcode:$langcode){... on RouteInternal{entity{... on NodeArticle{id title path body{processed} created{time}}}}}}';
type Article={id:string;title:string;path:string;created:{time:string};body?:{processed:string}};
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function validSlug(raw:string) {
  try{return raw.length<=240&&/^[a-z0-9%-]+$/i.test(raw)&&!/[\\/\?#<>"'\u0000-\u0020]/.test(decodeURIComponent(raw))&&!decodeURIComponent(raw).includes('..');}catch{return false;}
}
function checkedArticle(a:Article) {
  if(!a||typeof a.id!=='string'||typeof a.title!=='string'||typeof a.path!=='string'||!a.path.startsWith('/console/it/')||!validSlug(a.path.slice('/console/it/'.length))||!/^\d{4}-\d{2}-\d{2}T/.test(a.created?.time)||!Number.isFinite(Date.parse(a.created.time)))throw new Error('Unrecognized official airport article');
  return a;
}
export function toscanaArticleLink(a:Article) {checkedArticle(a);return origin+'/it/news/'+a.path.split('/').at(-1);}
export function renderToscanaArticle(a:Article) {
  checkedArticle(a);if(typeof a.body?.processed!=='string'||!a.body.processed.trim())throw new Error('Missing official airport article body');
  const $=cheerio.load(a.body.processed);$('script,style,iframe,object').remove();
  // Text and approved link discovery are consumed by the existing source parser,
  // never executed as browser code or used as model instructions.
  return `<html><head><meta property="article:published_time" content="${escape(a.created.time)}"></head><body><main><article><h1>${escape(a.title)}</h1>${$('body').html()||''}</article></main></body></html>`;
}
export async function fetchToscanaNotice(input:string,deadline:number,fetcher=fetch):Promise<string> {
  const u=new URL(input);
  if(u.origin!==origin||u.username||u.password||u.search||!u.pathname.startsWith('/it/news/')||u.pathname.slice('/it/news/'.length).replace(/\/$/,'')&&!validSlug(u.pathname.slice('/it/news/'.length).replace(/\/$/,'')))throw new Error('Unapproved airport notice URL');
  async function post(query:string,variables:object) {
    const remaining=deadline-Date.now();if(remaining<100)throw new Error('Airport discovery budget exhausted');
    const response=await fetcher(endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining)),headers:{'Content-Type':'application/json','User-Agent':SOURCE_USER_AGENT},body:JSON.stringify({query,variables})});
    if(!response.ok||!response.headers.get('content-type')?.includes('json')){await response.body?.cancel();throw new Error('Official airport API unavailable');}
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing airport API body');const chunks:Uint8Array[]=[];let size=0;
    for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2_000_000||Date.now()>deadline){await reader.cancel();throw new Error('Airport API size/time limit');}chunks.push(r.value);}
    const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(json.errors?.length||!json.data)throw new Error('Official airport API schema changed');return json.data;
  }
  const slug=u.pathname.replace(/^\/it\/news\//,'').replace(/\/$/,'');
  if(slug){const data=await post(detailQuery,{langcode:'it',slug:'/it/'+slug});const a=checkedArticle(data.route?.entity);if(toscanaArticleLink(a)!==origin+'/it/news/'+slug)throw new Error('Mismatched airport article identity');return renderToscanaArticle(a);}
  const articles:Article[]=[];let total=0;
  for(let page=0;page<8;page++){
    const data=await post(listQuery,{langcode:'it',page,pageSize:30}),view=data.articlesViewList;
    if(!Array.isArray(view?.results)||!Number.isSafeInteger(view.pageInfo?.total)||view.pageInfo.total<0||view.pageInfo.page!==page||view.pageInfo.total>240)throw new Error('Airport index pagination changed or exceeds bound');
    if(page&&total!==view.pageInfo.total)throw new Error('Airport index changed during pagination');total=view.pageInfo.total;articles.push(...view.results.map(checkedArticle));
    if(articles.length>=total)break;if(!view.results.length)throw new Error('Incomplete airport index');
  }
  if(articles.length<total||new Set(articles.map(a=>a.id)).size!==articles.length)throw new Error('Incomplete or duplicated airport index');
  return '<main>'+articles.map(a=>`<a href="${escape(toscanaArticleLink(a))}">${escape(a.title)}</a>`).join('')+'</main>';
}
