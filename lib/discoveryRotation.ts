// Every URL moves to the head once per cycle, including permanently failing
// publishers. Sorting first makes network completion order irrelevant.
export function rotateDiscoveryUrls(urls:string[],now:Date):string[] {
  const unique=[...new Set(urls)].sort();
  if(!unique.length)return [];
  const offset=Math.floor(now.getTime()/86400000)%unique.length;
  return [...unique.slice(offset),...unique.slice(0,offset)];
}

export type DiscoveryAttempt = { firstDiscoveredAt:string; lastAttemptedAt?:string };
export function orderDiscoveryUrls(urls:string[],now:Date,history:Map<string,DiscoveryAttempt>,imminent?:Map<string,string>,hoistLimit=Infinity):string[] {
  // Persistent age comes before the rotating tie-breaker. Newly arriving links
  // cannot indefinitely displace an older deferred article.
  const age=(url:string)=>Date.parse(history.get(url)?.lastAttemptedAt || history.get(url)?.firstDiscoveredAt || now.toISOString());
  const byAge=rotateDiscoveryUrls(urls,now).sort((a,b)=>age(a)-age(b));
  if(!imminent?.size)return byAge;
  // A notice for a strike in the next few days cannot wait its turn in a
  // multi-day rotation: soonest strike first. The hoist is bounded so the
  // remaining attempts still rotate through everything else.
  const hoisted=byAge.filter(url=>imminent.has(url)).sort((a,b)=>imminent.get(a)!.localeCompare(imminent.get(b)!)).slice(0,hoistLimit),head=new Set(hoisted);
  return [...hoisted,...byAge.filter(url=>!head.has(url))];
}
