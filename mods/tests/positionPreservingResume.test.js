import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { h5vcc: null, localStorage: { 'ytaf-configuration': '{}' } };
const { installPositionPreservingResume } =
    await import('../features/positionPreservingResume.js');

function harness({active=true, avplay=null, player=null, initialHidden=false}={}) {
    const handlers=new Map(),queue=new Map(),reports=[];
    let tick=0,next=0,driver=player,api=avplay;
    const doc={
        hidden:initialHidden,
        addEventListener(n,fn){handlers.set(n,fn)},
        removeEventListener(n,fn){if(handlers.get(n)===fn)handlers.delete(n)}
    };
    const cancel=installPositionPreservingResume({
        doc,enabled:()=>active,getAVPlay:()=>api,getYoutubePlayer:()=>driver,
        schedule(fn,delay){const id=++next;queue.set(id,{fn,time:tick+delay});return id},
        unschedule(id){queue.delete(id)},
        report(code){reports.push(code)}
    });
    function emit(hidden){
        doc.hidden=hidden;
        handlers.get('visibilitychange')?.();
    }
    function advance(ms){
        const target=tick+ms;
        while(true){
            const e=[...queue.entries()].filter(([,v])=>v.time<=target)
                .sort((a,b)=>a[1].time-b[1].time)[0];
            if(!e)break;
            queue.delete(e[0]);tick=e[1].time;e[1].fn();
        }
        tick=target;
    }
    return {
        emit,advance,cancel,reports,handlers,queue,
        setEnabled(v){active=v},setPlayer(v){driver=v},setAVPlay(v){api=v}
    };
}
function mockAV(state='PLAYING'){
    const calls=[];
    return {
        calls,getState(){calls.push('getState');return state},
        suspend(){calls.push('suspend')},
        restoreAsync(url,time,prepare,ok,err){
            calls.push(['restoreAsync',url,time,prepare]);ok();
        }
    };
}
function mockYT({id='video-1',time=83.5,playing=true}={}){
    const calls=[];
    return {
        calls,getVideoData(){return {video_id:id}},
        getCurrentTime(){return time},
        getPlayerStateObject(){return {isPlaying:playing}},
        pauseVideo(){calls.push('pause')},
        loadVideoById(options){calls.push(['load',options])},
        addEventListener(name,fn){this._listener=fn},
        removeEventListener(name,fn){if(this._listener===fn)this._listener=null}
    };
}
test('off by default: never touch any player',()=>{
 const api=mockAV(),h=harness({active:false,avplay:api});
 h.emit(true);h.emit(false);h.advance(9000);
 assert.deepEqual(api.calls,[]);assert.deepEqual(h.reports,[]);
 h.cancel();
});
test('active AVPlay uses Samsung suspend and async restore without URL or new time',()=>{
 const api=mockAV(),h=harness({avplay:api,player:mockYT()});
 h.emit(true);assert.deepEqual(api.calls,['getState','suspend']);
 h.emit(false);h.advance(350);
 assert.deepEqual(api.calls,[ 'getState','suspend',['restoreAsync',null,0,false]]);
 assert.deepEqual(h.reports,['AVPLAY_RESTORE_OK','AVPLAY_RESTORE_REQUESTED']);
 h.cancel();
});
test('native PAUSED session still restores saved position',()=>{
 const api=mockAV('PAUSED'),h=harness({avplay:api});
 h.emit(true);h.emit(false);h.advance(500);
 assert.equal(api.calls[1],'suspend');assert.equal(api.calls[2][0],'restoreAsync');
 h.cancel();
});
test('inactive AVPlay falls back to YouTube without native writes',()=>{
 const api=mockAV('IDLE'),p=mockYT(),h=harness({avplay:api,player:p});
 h.emit(true);h.emit(false);h.advance(350);
 assert.deepEqual(api.calls,['getState']);
 assert.deepEqual(p.calls,['pause',['load',{videoId:'video-1',startSeconds:83.5}]]);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED']);
 h.cancel();
});
test('native API failure never mixes in YouTube seek',()=>{
 const p=mockYT(),a=mockAV();
 a.suspend=()=>{throw Error('not ready')};
 const h=harness({avplay:a,player:p});
 h.emit(true);h.emit(false);h.advance(500);
 assert.deepEqual(p.calls,[]);
 assert.ok(h.reports.includes('AVPLAY_SUSPEND_FAILED'));
 h.cancel();
});
test('YouTube resume preserves same video ID and exact seconds',()=>{
 const p=mockYT({id:'v-test',time:152.123}),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(349);
 assert.deepEqual(p.calls,['pause']);
 h.advance(1);
 assert.deepEqual(p.calls,['pause',['load',{videoId:'v-test',startSeconds:152.123}]]);
 h.cancel();
});
test('YouTube paused before switching remains paused',()=>{
 const p=mockYT({playing:false,time:44}),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(350);
 assert.deepEqual(p.calls,[['load',{videoId:'video-1',startSeconds:44}]]);
 h.cancel();
});
test('new video, same player object: no stale seek',()=>{
 let id='a';
 const p=mockYT();
 p.getVideoData=()=>({video_id:id});
 const h=harness({player:p});
 h.emit(true);id='b';h.emit(false);h.advance(350);
 assert.deepEqual(p.calls,['pause']);assert.deepEqual(h.reports,['YT_DIFFERENT_VIDEO']);
 h.cancel();
});
test('replaced player element: no stale seek',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.setPlayer(mockYT({id:'different'}));
 h.emit(false);h.advance(500);
 assert.deepEqual(p.calls,['pause']);assert.deepEqual(h.reports,['YT_DIFFERENT_VIDEO']);
 h.cancel();
});
test('no supported player reports but never reloads or navigates',()=>{
 const h=harness();h.emit(true);h.emit(false);h.advance(350);
 assert.deepEqual(h.reports,['NO_SUPPORTED_PLAYER']);h.cancel();
});
test('disabled between hide and resume cancels restoration',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.setEnabled(false);h.emit(false);h.advance(800);
 assert.deepEqual(p.calls,['pause']);assert.deepEqual(h.reports,[]);h.cancel();
});
test('disabled after resume before delayed restore cancels it',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.setEnabled(false);h.advance(800);
 assert.deepEqual(p.calls,['pause']);h.cancel();
});
test('second switch invalidates outstanding delayed restoration',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(100);h.emit(true);h.advance(1000);
 assert.deepEqual(p.calls,['pause','pause']);assert.equal(h.queue.size,0);h.cancel();
});
test('duplicate hidden events preserve snapshot',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(true);h.emit(false);h.advance(500);
 assert.deepEqual(p.calls,['pause',['load',{videoId:'video-1',startSeconds:83.5}]]);h.cancel();
});
test('unmount cancels timers and unregisters listener',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.cancel();h.advance(1000);
 assert.equal(h.handlers.size,0);assert.equal(h.queue.size,0);
 assert.deepEqual(p.calls,['pause']);
});
test('initially backgrounded first foreground never restores',()=>{
 const p=mockYT(),h=harness({player:p,initialHidden:true});
 h.emit(false);h.advance(1000);
 assert.deepEqual(p.calls,[]);
 h.emit(true);h.emit(false);h.advance(1000);
 assert.deepEqual(p.calls,['pause',['load',{videoId:'video-1',startSeconds:83.5}]]);
 h.cancel();
});
test('native restore exceptions are isolated',()=>{
 const a=mockAV();
 a.restoreAsync=()=>{throw Error('restore broken')};
 const h=harness({avplay:a});h.emit(true);h.emit(false);h.advance(500);
 assert.deepEqual(h.reports,['AVPLAY_RESTORE_FAILED']);h.cancel();
});
test('YouTube session-recreate exceptions cannot trigger a reload',()=>{
 const p=mockYT();p.loadVideoById=()=>{throw Error('unavailable')};
 const h=harness({player:p});h.emit(true);h.emit(false);h.advance(500);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_RECREATE_FAILED']);h.cancel();
});
test('Youtube missing ID, nonfinite position and ended state never seek',()=>{
 for (const variation of ['empty','infinite','ended']){
  const p=mockYT();
  if(variation==='empty')p.getVideoData=()=>({video_id:''});
  if(variation==='infinite')p.getCurrentTime=()=>Infinity;
  if(variation==='ended')p.getPlayerStateObject=()=>({isEnded:true});
  const h=harness({player:p});h.emit(true);h.emit(false);h.advance(500);
  assert.deepEqual(p.calls,[]);assert.deepEqual(h.reports,['NO_SUPPORTED_PLAYER']);h.cancel();
 }
});
test('sync AVPlay fallback restores exactly once',()=>{
 const a=mockAV();delete a.restoreAsync;
 let restored=0;a.restore=()=>restored++;
 const h=harness({avplay:a});h.emit(true);h.emit(false);h.advance(500);
 assert.equal(restored,1);assert.deepEqual(h.reports,['AVPLAY_RESTORE_OK']);h.cancel();
});

test('V6 fallback: private TV player without loadVideoById reports unavailable',()=>{
 const p=mockYT();delete p.loadVideoById;
 const h=harness({player:p});h.emit(true);h.emit(false);h.advance(700);
 assert.deepEqual(p.calls,['pause']);
 assert.deepEqual(h.reports,['YT_SESSION_API_UNAVAILABLE']);h.cancel();
});
test('V6 updated method: onStateChange pauses new session at saved time',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(350);
 assert.equal(typeof p._listener,'function');
 p._listener();
 assert.deepEqual(p.calls,['pause',
     ['load',{videoId:'video-1',startSeconds:83.5}],'pause']);
 assert.deepEqual(h.reports,
     ['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_STATE_RECEIVED']);
 assert.equal(p._listener,null);
 assert.equal(h.queue.size,0);
 h.advance(10000);
 assert.equal(h.reports.length,2);
 h.cancel();
});
test('V6 updated method: timeout reports no state event and clears listener',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(7350);
 assert.deepEqual(h.reports,
     ['YT_SESSION_RECREATE_REQUESTED','YT_SESSION_NO_STATE_EVENT']);
 assert.equal(p._listener,null);h.cancel();
});
test('V6 updated method: another app switch clears prior player-state listener',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(350);
 assert.equal(typeof p._listener,'function');
 h.emit(true);
 assert.equal(p._listener,null);
 h.advance(8000);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED']);
 h.cancel();
});
test('V6 updated method: different video after request prevents pausing it',()=>{
 let id='video-1';const p=mockYT();
 p.getVideoData=()=>({video_id:id});
 const h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(350);
 id='another-video';p._listener();
 assert.deepEqual(p.calls,['pause',
     ['load',{videoId:'video-1',startSeconds:83.5}]]);
 assert.equal(h.reports.at(-1),'YT_SESSION_CHANGED_VIDEO');
 assert.equal(p._listener,null);h.cancel();
});
test('V6 updated method: disable after request cancels callback',()=>{
 const p=mockYT(),h=harness({player:p});
 h.emit(true);h.emit(false);h.advance(350);
 h.setEnabled(false);
 p._listener();
 h.advance(9000);
 assert.deepEqual(h.reports,['YT_SESSION_RECREATE_REQUESTED']);
 h.cancel();
});
