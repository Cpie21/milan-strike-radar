/** Optional discovery must leave time to commit the official snapshot and close its lease. */
export async function optionalSyncStage<T>(name:string,deadline:number,neededMs:number,warnings:string[],run:()=>Promise<T>,fallback:()=>T,now=Date.now):Promise<T> {
  if(deadline-now()<neededMs){warnings.push(`Optional stage deferred by sync deadline: ${name}`);return fallback();}
  try{return await run();}catch{warnings.push(`Optional stage unavailable: ${name}`);return fallback();}
}
