/** Use wall time across backgrounding; a timed session ends at its deadline. */
export function sessionClock(session,now=Date.now()) {
  const started=Number.isFinite(session?.startedAt)?session.startedAt:now;
  const deadline=session?.timed&&Number.isFinite(session.deadline)?session.deadline:null;
  const expired=deadline!==null&&now>=deadline;
  return {expired,seconds:Math.max(0,Math.floor(((deadline===null?now:Math.min(now,deadline))-started)/1000)),remaining:deadline===null?null:Math.max(0,Math.ceil((deadline-now)/1000))};
}
