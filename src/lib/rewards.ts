import {addDays, streak} from './dates';
import type {FocusSession} from './types';
/** Recomputed from unique saved completion dates: no claim button or duplicate awards. */
export function rewards(sessions:FocusSession[], today:string) {
 const record=streak(sessions,today); let run=0,bonuses=0,previous='';
 for(const day of record.days){run=previous&&addDays(previous,1)===day?run+1:1;if(run%5===0)bonuses++;previous=day;}
 const cycle=record.current===0?0:(record.current-1)%10+1;
 return {...record,cycle,points:record.days.length*10+bonuses*25,bonuses};
}
/** Use the server's distinct Riyadh completion dates without loading old sessions. */
export function rewardsFromDays(days:string[],today:string){
 return rewards(days.map((day,index)=>({id:String(index),kind:'focus',status:'completed',completed_at:`${day}T12:00:00Z`}) as FocusSession),today);
}
