// Every URL moves to the head once per cycle, including permanently failing
// publishers. Sorting first makes network completion order irrelevant.
export function rotateDiscoveryUrls(urls:string[],now:Date):string[] {
  const unique=[...new Set(urls)].sort();
  if(!unique.length)return [];
  const offset=Math.floor(now.getTime()/86400000)%unique.length;
  return [...unique.slice(offset),...unique.slice(0,offset)];
}

export type DiscoveryAttempt = { firstDiscoveredAt:string; lastAttemptedAt?:string };
export function orderDiscoveryUrls(urls:string[],now:Date,history:Map<string,DiscoveryAttempt>):string[] {
  // Persistent age comes before the rotating tie-breaker. Newly arriving links
  // cannot indefinitely displace an older deferred article.
  const age=(url:string)=>Date.parse(history.get(url)?.lastAttemptedAt || history.get(url)?.firstDiscoveredAt || now.toISOString());
  return rotateDiscoveryUrls(urls,now).sort((a,b)=>age(a)-age(b));
}
