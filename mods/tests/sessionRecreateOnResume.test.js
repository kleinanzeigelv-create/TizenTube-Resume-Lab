import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={ h5vcc:null,localStorage:{'ytaf-configuration':'{}'} };
const { installSessionRecreateOnResume } =
    await import('../features/sessionRecreateOnResume.js');

function player({id='abc',time=85,play=true,loadApi=true}={}) {
    const calls=[],events=new Map();
    let vid=id;
    const p={
        calls,events,
        getVideoData(){return {video_id:vid}},
        getCurrentTime(){return time},
        getPlayerStateObject(){return {isPlaying:play,isPaused:!play}},
        pauseVideo(){calls.push('pause');play=false},
        addEventListener(name,fn){events.set(name,fn)},
        removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name)},
        loadVideoById(x){calls.push(['load',x]);}
    };
    if(!loadApi)delete p.loadVideoById;
    return {p,setId(v){vid=v},setTime(v){time=v},setPlay(v){play=v},
        event(){events.get('onStateChange')?.()}};
}
function harness({enabled=true,pl=player(),startHidden=false}={}) {
    const handlers=new Map(),timers=new Map(),reports=[];
    let time=0,next=0,current=pl.p;
    const doc={
        hidden:startHidden,
        addEventListener(type,fn){handlers.set(type,fn)},
        removeEventListener(type,fn){if(handlers.get(type)===fn)handlers.delete(type)}
    };
    const dispose=installSessionRecreateOnResume({
        doc,enabled:()=>enabled,getPlayer:()=>current,
        report:s=>reports.push(s),
        schedule(fn,ms){let id=++next;timers.set(id,{time:time+ms,fn});return id},
        unschedule:id=>timers.delete(id)
    });
    function emit(hidden){doc.hidden=hidden;handlers.get('visibilitychange')?.()}
    function advance(ms){
        let end=time+ms;
        for(;;){
            const x=[...timers].filter(([,v])=>v.time<=end)
                .sort((a,b)=>a[1].time-b[1].time)[0];
            if(!x)break;
            time=x[1].time;timers.delete(x[0]);x[1].fn();
        }
        time=end;
    }
    return {pl,emit,advance,reports,handlers,timers,dispose,
        setEnabled(v){enabled=v},setPlayer(p){current=p}};
}
test('off is strictly no-op',()=>{
 const h=harness({enabled:false});h.emit(true);h.emit(false);h.advance(9000);
 assert.deepEqual(h.pl.p.calls,[]);assert.deepEqual(h.reports,[]);h.dispose();
});
test('supported fresh session is requested using exact same id and position',()=>{
 const h=harness();h.emit(true);h.emit(false);h.advance(650);
 assert.deepEqual(h.pl.p.calls,[
  'pause',['load',{videoId:'abc',startSeconds:85}]]);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED']);
 h.dispose();
});
test('missing load API reports only and never reloads page',()=>{
 const h=harness({pl:player({loadApi:false})});
 h.emit(true);h.emit(false);h.advance(700);
 assert.deepEqual(h.pl.p.calls,['pause']);
 assert.deepEqual(h.reports,['YT_SESSION_API_UNAVAILABLE']);h.dispose();
});
test('one later playing state is paused and acknowledged',()=>{
 const h=harness();
 h.emit(true);h.emit(false);h.advance(650);
 h.pl.setTime(85);h.pl.setPlay(true);h.pl.event();
 assert.deepEqual(h.pl.p.calls,[
  'pause',['load',{videoId:'abc',startSeconds:85}],'pause']);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_STATE_RECEIVED']);
 h.advance(14000);
 assert.equal(h.reports.length,2);h.dispose();
});
test('no player-state event reports diagnostic, not success',()=>{
 const h=harness();h.emit(true);h.emit(false);h.advance(7650);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_NO_STATE_EVENT']);h.dispose();
});
test('video change after hide prevents loading the old video',()=>{
 const h=harness();h.emit(true);h.pl.setId('later');
 h.emit(false);h.advance(9000);
 assert.deepEqual(h.pl.p.calls,['pause']);
 assert.deepEqual(h.reports,['YT_SESSION_CHANGED_VIDEO']);h.dispose();
});
test('player replacement prevents recreating a stale session',()=>{
 const h=harness();h.emit(true);h.setPlayer(player({id:'next'}).p);
 h.emit(false);h.advance(1000);
 assert.deepEqual(h.pl.p.calls,['pause']);
 assert.deepEqual(h.reports,['YT_SESSION_CHANGED_VIDEO']);h.dispose();
});
test('duplicate hidden notifications do not duplicate session',()=>{
 const h=harness();h.emit(true);h.emit(true);h.emit(false);h.advance(700);
 assert.deepEqual(h.pl.p.calls,['pause',['load',{videoId:'abc',startSeconds:85}]]);
 h.dispose();
});
test('second background cancels pending timers and listener',()=>{
 const h=harness();h.emit(true);h.emit(false);h.advance(650);
 assert.equal(h.pl.p.events.size,1);
 h.emit(true);
 assert.equal(h.pl.p.events.size,0);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED']);
 h.dispose();
});
test('turning experiment off before resume suppresses recreation',()=>{
 const h=harness();h.emit(true);h.setEnabled(false);h.emit(false);h.advance(10000);
 assert.deepEqual(h.pl.p.calls,['pause']);assert.deepEqual(h.reports,[]);h.dispose();
});
test('turning off during settle prevents calling loadVideoById',()=>{
 const h=harness();h.emit(true);h.emit(false);h.setEnabled(false);h.advance(10000);
 assert.deepEqual(h.pl.p.calls,['pause']);h.dispose();
});
test('unmount cancels listeners and timers',()=>{
 const h=harness();h.emit(true);h.emit(false);h.dispose();h.advance(8000);
 assert.equal(h.handlers.size,0);assert.equal(h.timers.size,0);
 assert.deepEqual(h.pl.p.calls,['pause']);
});
test('already paused video stays paused before background',()=>{
 const h=harness({pl:player({play:false})});
 h.emit(true);h.emit(false);h.advance(800);
 assert.deepEqual(h.pl.p.calls,[['load',{videoId:'abc',startSeconds:85}]]);
 h.dispose();
});
test('invalid ID or time cannot create session',()=>{
 for(const options of [{id:''},{time:NaN},{time:-1}]) {
  const h=harness({pl:player(options)});
  h.emit(true);h.emit(false);h.advance(800);
  assert.deepEqual(h.pl.p.calls,[]);
  assert.ok(h.reports.includes('YT_SESSION_SNAPSHOT_UNAVAILABLE'));
  h.dispose();
 }
});
test('loadVideoById throwing reports failure and unregisters',()=>{
 const pl=player();pl.p.loadVideoById=()=>{throw Error('unsupported')};
 const h=harness({pl});
 h.emit(true);h.emit(false);h.advance(700);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_RECREATE_FAILED']);
 assert.equal(h.pl.p.events.size,0);h.dispose();
});

// Some wrappers dispatch their first state immediately within loadVideoById.
// The status watchdog must already be installed.
test('synchronous new playback state cannot leave a delayed stale watchdog',()=>{
 const pl=player();
 pl.p.loadVideoById=x=>{
  pl.p.calls.push(['load',x]);
  pl.setPlay(true);
  pl.event();
 };
 const h=harness({pl});
 h.emit(true);h.emit(false);h.advance(650);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_STATE_RECEIVED']);
 assert.equal(h.timers.size,0);
 h.advance(10000);
 assert.equal(h.reports.length,2);
 h.dispose();
});
