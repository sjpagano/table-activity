import {createClient} from './vendor/supabase.js';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js?v=20261013-3';
export const cloud=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export function check(error) {if(error)throw Error(error.message||'The database could not be reached. Your scans are still here; try again.');}
export async function loadDays() {
  const result=[];let after=null;
  while(true) {
    let q=cloud.from('activity_days').select('date,rows,times,grid,source_name,date_source,revision,archived,updated_at').order('date').limit(500);
    if(after)q=q.gt('date',after);
    const {data,error}=await q;check(error);result.push(...data);
    if(data.length<500)return result;
    after=data[data.length-1].date;
  }
}
export async function saveDays(plan) {
  const {data,error}=await cloud.rpc('save_activity_batch',{p_days:plan.map(({previous,changed_elsewhere,...record})=>record)});check(error);return data;
}
export async function archiveDay(record,archived) {
  const {data,error}=await cloud.rpc('archive_activity_day',{p_date:record.date,p_revision:record.revision,p_archived:archived});check(error);return data[0];
}
