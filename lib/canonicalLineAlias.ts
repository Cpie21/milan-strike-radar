/** Reviewed public/GTFS identity, not fuzzy text matching or strike evidence. */
export const GEST_ALIAS_SOURCE='https://www.firenzetramvia.it/linee/t1';
export const GEST_FEED_SOURCE='https://dati.toscana.it/dataset/8bb8f8fe-fe7d-41d0-90dc-49f2456180d1/resource/1f62d551-65f4-49f8-9a99-e19b02077be3/download/gest.gtfs';
export type AliasRoute={id:string;name:string;type:number;longName?:string;operator?:string};
export type AliasContext={operator:string;feedId?:string|null;source?:string|null;date:string;category:string;validFrom:string|null;validTo:string|null;routes:AliasRoute[]};
export type LineAliasEvidence={officialName:string;catalogName:string;routeId:string;operator:string;feedId:string;source:string;catalogSource:string;validFrom:string;validTo:string;verifiedAt:string};
/** Re-review after Dec 30 or a changed feed identity; never guess another T1 variant. */
export function canonicalLineAlias(route:AliasRoute,c:AliasContext):LineAliasEvidence|undefined {
  if(c.operator!=='GEST_FIRENZE'||route.operator&&route.operator!==c.operator||c.feedId!=='GTFS_GEST'||c.source!==GEST_FEED_SOURCE||c.category!=='BUS'||route.type!==0||route.name!=='T1.3'||route.longName!=='Servizio Tramvia Firenze - Linea T1.3')return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!Number.isFinite(Date.parse(c.date+'T12:00:00Z'))||new Date(c.date+'T12:00:00Z').toISOString().slice(0,10)!==c.date||!c.validFrom||!c.validTo||c.date<c.validFrom||c.date>c.validTo||c.date<'2026-08-10'||c.date>'2026-12-30')return;
  // A newly coexisting T1 or duplicate alias target requires another review.
  if(c.routes.filter(r=>r.type===0&&['T1','T1.3'].includes(r.name.toUpperCase())).length!==1)return;
  return {officialName:'T1',catalogName:route.name,routeId:route.id,operator:c.operator,feedId:'GTFS_GEST',source:GEST_ALIAS_SOURCE,catalogSource:GEST_FEED_SOURCE,validFrom:c.validFrom>'2026-08-10'?c.validFrom:'2026-08-10',validTo:c.validTo<'2026-12-30'?c.validTo:'2026-12-30',verifiedAt:'2026-10-06'};
}
export function canonicalRouteName(route:AliasRoute,context:AliasContext) {
  return canonicalLineAlias(route,context)?.officialName || route.name;
}
