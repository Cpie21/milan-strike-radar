import * as cheerio from 'cheerio';

export const EASYJET_NOTICE_URL = 'https://www.easyjet.com/en/help-centre/before-you-fly/latest-travel-information';

// These are the actual public page's Sitecore cards, not analytics labels or
// inferred API responses. No script execution, API key or browser is involved.
export function easyJetNoticeDocuments(html:string,url:string):string[] | null {
  if(url!==EASYJET_NOTICE_URL)return null;
  const $=cheerio.load(html),raw=$('script#__JSS_STATE__[type="application/json"]').text();
  if(!raw)return null;
  const state=JSON.parse(raw),context=state?.sitecore?.context,route=state?.sitecore?.route;
  if(context?.pageEditing!==false || context?.pageState!=='normal' || context?.language!=='en' || context?.itemPath!=='/en/help-centre/before-you-fly/latest-travel-information')throw new Error('Unexpected public easyJet page identity');
  const cards:unknown[]=[];
  function walk(placeholders:unknown,depth=0) {
    if(depth>12 || !placeholders || typeof placeholders!=='object')throw new Error('Invalid easyJet public page structure');
    for(const components of Object.values(placeholders)) {
      if(!Array.isArray(components))throw new Error('Invalid easyJet component list');
      for(const component of components) {
        if(component.componentName==='PaginatedCardList') {
          if(!Array.isArray(component.fields?.Cards))throw new Error('Missing easyJet public cards');
          cards.push(...component.fields.Cards);
        }
        if(component.placeholders)walk(component.placeholders,depth+1);
      }
    }
  }
  walk(route?.placeholders);
  if(cards.length>100)throw new Error('easyJet public card bound exceeded');
  const seen=new Set<string>(),escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return cards.map(value=>{
    const card=value as {id?:string;fields?:{Title?:{value?:string};Description?:{value?:string};Date?:{value?:string}}};
    const title=card.fields?.Title?.value,description=card.fields?.Description?.value,date=card.fields?.Date?.value;
    if(!card.id || seen.has(card.id) || typeof title!=='string' || typeof description!=='string' || typeof date!=='string' || !Number.isFinite(Date.parse(date)))throw new Error('Invalid or duplicate easyJet public card');
    seen.add(card.id);
    const body=cheerio.load(description);body('script,style,iframe,object').remove();
    return `<meta property="article:published_time" content="${escape(date)}"><article data-public-operator-card="${escape(card.id)}"><h1>${escape(title)}</h1>${body('body').html() || ''}</article>`;
  });
}
