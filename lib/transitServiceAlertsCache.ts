import { unstable_cache } from 'next/cache';
import { fetchServiceAlerts, currentServiceAlerts } from './transitServiceAlerts';
// Cache a failed fetch briefly as well, so visitors cannot trigger a retry
// storm. Re-check successful feed timestamps on every response.
const read=unstable_cache(async()=>{
  try{return await fetchServiceAlerts();}catch{return null;}
},['rome-official-service-alert-result-v2'],{revalidate:60});
export async function readCurrentServiceAlerts() {
  const result=await read();
  return result?currentServiceAlerts(result):null;
}
