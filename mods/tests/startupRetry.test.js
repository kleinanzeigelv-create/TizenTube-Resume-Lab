import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupRetry } from '../utils/startupRetry.js';

function fakeTime() {
  let time=0,next=0,scheduled=0;
  const tasks=new Map();
  function schedule(fn,ms) {
    assert.ok(ms>0);
    assert.ok(tasks.size<=1);
    const id=++next;
    tasks.set(id,{fn,due:time+ms});
    scheduled++;
    return id;
  }
  function cancel(id) {tasks.delete(id);}
  function advance(ms) {
    const end=time+ms;
    while(true) {
      const first=[...tasks.entries()].sort((a,b)=>a[1].due-b[1].due)[0];
      if(!first||first[1].due>end)break;
      time=first[1].due;
      tasks.delete(first[0]);
      first[1].fn();
    }
    time=end;
  }
  return {schedule,cancel,advance,now:()=>time,
    get pending(){return tasks.size},
    get scheduled(){return scheduled},
    get time(){return time}};
}
test('first missing YouTube runtime uses one 250ms retry',()=>{
  const t=fakeTime(),r=createStartupRetry({...t});
  let count=0;
  r.retry(()=>count++);
  assert.equal(t.pending,1);
  t.advance(249);assert.equal(count,0);
  t.advance(1);assert.equal(count,1);
  r.finish();assert.equal(t.pending,0);
});
test('backoff reduces requests on old slow TV compared to 250ms loops',()=>{
  const t=fakeTime(),r=createStartupRetry({...t});
  let count=0;
  const run=()=>{count++;r.retry(run);};
  r.retry(run);
  t.advance(60000);
  assert.ok(count<25, 'less than 25 retries per minute');
  assert.ok(count>10, 'still checks when startup is slow');
  assert.equal(t.pending,1);
  r.finish();
});
test('missing runtime is bounded to two minutes and no background timer remains',()=>{
  const t=fakeTime(),r=createStartupRetry({...t});
  let count=0;
  const run=()=>{count++;r.retry(run);};
  r.retry(run);
  t.advance(150000);
  assert.ok(count>10);
  assert.ok(t.scheduled<45);
  assert.equal(t.pending,0);
  assert.equal(r.retry(run),false);
});
test('success cancels an outstanding retry and future polling',()=>{
  const t=fakeTime(),r=createStartupRetry({...t});
  let sent=0;
  r.retry(()=>sent++);
  r.finish();
  t.advance(600000);
  assert.equal(sent,0);
  assert.equal(t.pending,0);
  assert.equal(r.retry(()=>sent++),false);
});
test('repeated callers cannot accumulate parallel retry timers',()=>{
  const t=fakeTime(),r=createStartupRetry({...t});
  assert.equal(r.retry(()=>{}),true);
  assert.equal(r.retry(()=>{}),false);
  assert.equal(t.pending,1);
  r.finish();
});
test('a long-delayed TV timer cannot restart polling after its deadline',()=>{
  const t=fakeTime(),r=createStartupRetry({...t,maxWaitMs:1000});
  let count=0;
  const run=()=>{count++;r.retry(run);};
  r.retry(run);
  t.advance(3000);
  assert.equal(t.pending,0);
  assert.equal(r.retry(run),false);
});
