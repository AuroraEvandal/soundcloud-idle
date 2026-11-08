import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const player = '00000000-0000-4000-8000-000000000081'
const other = '00000000-0000-4000-8000-000000000082'
const id = () => crypto.randomUUID()
const rpc = async (sql, args = []) => (await db.query(sql, args)).rows[0].result
const act = (action, payload = {}, request = id(), owner = player) => rpc('select concert_action($1,$2,$3,$4) result', [owner,action,payload,action === 'get' ? null : request])
before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  await db.exec(await readFile(new URL('../../backend/schema.sql', import.meta.url), 'utf8'))
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).sort()) await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../backend/seed.sql', import.meta.url), 'utf8'))
  await db.query('insert into players(id,telegram_id,coins) values($1,81,1000),($2,82,0)', [player,other])
})
after(() => db.close())

test('career starts with real player money; show restarts restore the same attempt', async () => {
  const initial = await act('get')
  assert.equal(initial.career.coins,1000)
  const request = id()
  const start = await act('start',{episodeId:0,choiceId:'artist'},request)
  assert.equal(start.show.events.length,12)
  assert.equal(start.show.quality,70)
  assert.equal(start.show.energy,35)
  assert.equal((await act('get')).show.id,start.show.id)
  assert.equal((await act('start',{episodeId:0,choiceId:'artist'},request)).show.id,start.show.id)
  await assert.rejects(act('start',{episodeId:1,choiceId:'artist'},request),/IDEMPOTENCY_CONFLICT/)
})

const start = async (episode = 0, owner = player, choice = 'artist') => {
  const current = await act('get',{},null,owner)
  if (current.show?.status === 'active') await act('abandon',{showId:current.show.id},id(),owner)
  return act('start',{episodeId:episode,choiceId:choice},id(),owner)
}
const setElapsed = (show, ms) => db.query("update concert_shows set scene_started_at=clock_timestamp()-make_interval(secs=>$2::double precision/1000) where id=$1",[show.id,ms])
const input = (show, actionId, owner = player, request = id()) => act('input',{showId:show.id,sceneId:show.events[show.scene_index].id,actionId},request,owner)
const next = (show, request = id(), owner = player) => act('next',{showId:show.id,sceneId:show.events[show.scene_index].id},request,owner)
const solve = async (initial, owner = player, fail = new Set(), finalRequest = id()) => {
  let current = initial
  for (let scene = 0; scene < 12; scene++) {
    let show = current.show
    const event = show.events[show.scene_index]
    if (fail.has(scene)) {
      await setElapsed(show,event.duration*1000+1)
      current = await act('get',{},null,owner)
    } else if (['frequency','level','crossfade'].includes(event.kind)) {
      if (event.secondary) current = await input(show,'monitor',owner)
      for (let ms = 0; ms <= event.hold_ms+600 && !current.show.outcomes[event.id]; ms += 300) {
        await setElapsed(show,ms)
        if (ms) await db.query("update concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-300)) where id=$1",[show.id])
        const target = Math.round(event.target+(event.moving ? Math.sin(ms/650)*event.amplitude : 0))
        current = await input(show,`${event.kind === 'frequency' ? 'dial' : 'fader'}-${target}`,owner)
      }
    } else if (event.kind === 'feedback') {
      current = await input(show,`mute-${event.channel}`,owner)
      await setElapsed(show,current.show.scene_progress.release_at_ms+5)
      current = await input(show,`unmute-${event.channel}`,owner)
    } else if (event.kind === 'artist') {
      current = await input(show,event.request,owner)
      await setElapsed(show,current.show.scene_progress.release_at_ms+5)
      current = await input(show,event.request === 'voice-off' ? 'voice-on' : 'loop-off',owner)
    } else {
      if (event.kind === 'blackout') await setElapsed(show,event.reveal_ms+1)
      const prefix = {pads:'pad',patch:'patch',blackout:'memory',power:'power'}[event.kind]
      for (const n of event.sequence) current = await input(show,`${prefix}-${n}`,owner)
    }
    assert.ok(current.show.outcomes[event.id],`${event.kind} must have server outcome`)
    if (!fail.has(scene)) assert.equal(current.show.outcomes[event.id].success,true,`${event.kind} succeeds`)
    current = await next(show,scene === 11 ? finalRequest : id(),owner)
  }
  return current
}

test('ownership, stage ordering, explicit abandonment and single active attempt are enforced', async () => {
  const current = await act('get')
  const show = current.show
  await assert.rejects(next(show),/CONCERT_SCENE_ACTIVE/)
  await assert.rejects(act('input',{showId:show.id,sceneId:'scene-2',actionId:'pad-0'}),/CONCERT_INVALID_ACTION/)
  await assert.rejects(act('abandon',{showId:show.id},id(),other),/CONCERT_NOT_FOUND/)
  await assert.rejects(act('start',{episodeId:0,choiceId:'owner'}),/CONCERT_SCENE_ACTIVE/)
  await assert.rejects(act('start',{episodeId:1,choiceId:'owner'}),/CONCERT_LOCKED/)
  const before = current.player.coins
  const abandoned = await act('abandon',{showId:show.id})
  assert.equal(abandoned.show.status,'abandoned')
  assert.equal(abandoned.player.coins,before)
  assert.deepEqual(abandoned.career.completed,[])
})

test('one teleport or fast packet burst cannot forge a hold; accepted continuity and secondary monitor are required', async () => {
  let current = await start()
  const show = current.show
  await db.query(`update concert_shows set events=jsonb_set(events,'{0}',events->0||'{"target":50,"moving":false,"tolerance":8,"hold_ms":900,"secondary":true}') where id=$1`,[show.id])
  current = await input(show,'dial-50')
  for (let i=0;i<12;i++) current = await input(show,'dial-50')
  assert.ok(current.show.scene_progress.hold_ms<900,'packet count alone cannot satisfy the hold duration')
  assert.deepEqual(current.show.outcomes,{})
  await assert.rejects(input(show,'dial-101'),/CONCERT_INVALID_ACTION/)
  await db.query("update concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-900)) where id=$1",[show.id])
  current = await input(show,'dial-50')
  assert.equal(current.show.scene_progress.hold_ms,0,'a missing keepalive resets continuity')
  await input(show,'dial-0')
  assert.equal((await act('get')).show.scene_progress.hold_ms,0,'leaving target resets continuity')
  await input(show,'dial-50')
  for (let i=0;i<4;i++) {
    await db.query("update concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-310)) where id=$1",[show.id])
    current = await input(show,'dial-50')
  }
  assert.ok(current.show.scene_progress.hold_ms>=900)
  assert.deepEqual(current.show.outcomes,{})
  current = await input(show,'monitor')
  assert.equal(current.show.outcomes['scene-1'].success,true)
  assert.equal(current.show.energy,40)
  await next(show)
  current = await act('get')
  const sequence = current.show.events[1].sequence
  const wrong = (sequence[0]+1)%4
  current = await input(current.show,`pad-${wrong}`)
  assert.equal(current.show.outcomes['scene-2'].success,false)
})

test('feedback and artist require timed second actions; blackout must reveal before memory input', async () => {
  let current = await start()
  const show = current.show
  await db.query('update concert_shows set scene_index=3,progress=concert_progress(events->3) where id=$1',[show.id])
  current = await act('get')
  let event = current.show.events[3]
  current = await input(current.show,`mute-${event.channel}`)
  await assert.rejects(input(current.show,`unmute-${event.channel}`),/CONCERT_INVALID_ACTION/)
  await setElapsed(show,current.show.scene_progress.release_at_ms+20)
  current = await input(current.show,`unmute-${event.channel}`)
  assert.equal(current.show.outcomes[event.id].success,true)
  await db.query('update concert_shows set scene_index=5,scene_started_at=clock_timestamp(),scene_base_ms=0,progress=concert_progress(events->5) where id=$1',[show.id])
  current = await act('get')
  event = current.show.events[5]
  current = await input(current.show,event.request)
  const release = event.request === 'voice-off' ? 'voice-on' : 'loop-off'
  await assert.rejects(input(current.show,release),/CONCERT_INVALID_ACTION/)
  await setElapsed(show,current.show.scene_progress.release_at_ms+20)
  current = await input(current.show,release)
  assert.equal(current.show.outcomes[event.id].success,true)
  await db.query('update concert_shows set scene_index=7,scene_started_at=clock_timestamp(),scene_base_ms=0,progress=concert_progress(events->7) where id=$1',[show.id])
  current = await act('get')
  event = current.show.events[7]
  await assert.rejects(input(current.show,`memory-${event.sequence[0]}`),/CONCERT_INVALID_ACTION/)
  await setElapsed(show,event.reveal_ms+1)
  for (const index of event.sequence) current = await input(current.show,`memory-${index}`)
  assert.equal(current.show.outcomes[event.id].success,true)
})

test('moving controls validate each endpoint at its own scene time with 600ms mobile samples', async () => {
  let current = await start()
  const show = current.show
  await db.query(`update concert_shows set events=jsonb_set(events,'{0}',events->0||'{"target":50,"moving":true,"amplitude":15,"tolerance":5,"hold_ms":1200,"secondary":false}') where id=$1`,[show.id])
  for (const ms of [0,600,1200]) {
    await setElapsed(show,ms)
    if (ms) await db.query("update concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-600)) where id=$1",[show.id])
    if (ms===600) await db.query("update concert_shows set progress=progress-'sample_ms' where id=$1",[show.id])
    current = await input(show,`dial-${Math.round(50+Math.sin(ms/650)*15)}`)
    if (ms===600) {
      assert.ok(current.show.scene_progress.hold_ms>=600,'a valid previous endpoint must count after the target moves away')
      assert.ok(Math.abs(50-(50+Math.sin(ms/650)*15))>9,'endpoints differ beyond base plus network tolerance')
    }
  }
  assert.equal(current.show.outcomes['scene-1']?.success,true)
})

test('moving controls allow four points of network tolerance and out-of-zone input resets the hold', async () => {
  let current = await start()
  let show = current.show
  await db.query(`update concert_shows set events=jsonb_set(events,'{0}',events->0||'{"target":50,"moving":true,"amplitude":0,"tolerance":5,"hold_ms":1200,"secondary":false}') where id=$1`,[show.id])
  await input(show,'dial-58')
  await db.query("update concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-600)) where id=$1",[show.id])
  current = await input(show,'dial-58')
  assert.ok(current.show.scene_progress.hold_ms>=600,'moving input within tolerance+4 is accepted')
  current = await input(show,'dial-0')
  assert.equal(current.show.scene_progress.hold_ms,0)
  assert.deepEqual(current.show.outcomes,{})
  current = await start()
  show = current.show
  await db.query(`update concert_shows set events=jsonb_set(events,'{0}',events->0||'{"target":50,"moving":false,"tolerance":5,"hold_ms":900,"secondary":false}') where id=$1`,[show.id])
  await input(show,'dial-58')
  await db.query("update concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-600)) where id=$1",[show.id])
  current = await input(show,'dial-58')
  assert.equal(current.show.scene_progress.hold_ms,0,'stationary controls retain their original tolerance')
})

test('pause freezes elapsed time, blocks inputs, resets hold continuity and expires after two minutes', async () => {
  const current = await start()
  const show = current.show
  await input(show,`dial-${show.events[0].target}`)
  const pause = await act('pause',{showId:show.id})
  assert.equal(pause.show.paused,true)
  assert.equal((await act('get')).show.scene_elapsed_ms,pause.show.scene_elapsed_ms)
  await assert.rejects(input(show,'dial-50'),/CONCERT_PAUSED/)
  assert.equal((await act('resume',{showId:show.id})).show.paused,false)
  await act('pause',{showId:show.id})
  await db.query("update concert_shows set paused_at=clock_timestamp()-interval '121 seconds' where id=$1",[show.id])
  const expired = await act('get')
  assert.equal(expired.show.paused,false)
  assert.equal(expired.show.outcomes['scene-1'].reason,'timeout')
  assert.equal(expired.player.coins,current.player.coins)
})

test('a month-old active or paused show recovers as a bounded timeout and can be abandoned', async () => {
  let current = await start()
  await db.query("update concert_shows set scene_started_at=clock_timestamp()-interval '30 days' where id=$1",[current.show.id])
  const directView = await rpc('select concert_view($1,$2) result',[player,current.show.id])
  assert.equal(directView.show.scene_elapsed_ms,current.show.events[0].duration*1000)
  current = await act('get')
  assert.equal(current.show.outcomes['scene-1'].reason,'timeout')
  assert.equal(current.show.scene_elapsed_ms,current.show.events[0].duration*1000)
  assert.equal((await act('abandon',{showId:current.show.id})).show.status,'abandoned')
  current = await start()
  await act('pause',{showId:current.show.id})
  await db.query("update concert_shows set paused_at=clock_timestamp()-interval '30 days' where id=$1",[current.show.id])
  current = await act('get')
  assert.equal(current.show.paused,false)
  assert.equal(current.show.outcomes['scene-1'].reason,'timeout')
  assert.ok(current.show.scene_elapsed_ms<=current.show.events[0].duration*1000)
  assert.equal((await act('abandon',{showId:current.show.id})).show.status,'abandoned')
})

test('next is bound to the resolved scene and replaying a lost response never skips another scene', async () => {
  let current = await start()
  const oldShow = current.show
  await setElapsed(oldShow,oldShow.events[0].duration*1000+1)
  await act('get')
  const request = id()
  current = await next(oldShow,request)
  assert.equal(current.show.scene_index,1)
  assert.equal((await next(oldShow,request)).show.scene_index,1)
  await assert.rejects(next(oldShow),/CONCERT_INVALID_ACTION/)
  await assert.rejects(next(current.show,request),/IDEMPOTENCY_CONFLICT/)
  await setElapsed(current.show,current.show.events[1].duration*1000+1)
  await act('get')
  await assert.rejects(next(oldShow),/CONCERT_INVALID_ACTION/)
  assert.equal((await next(current.show)).show.scene_index,2)
})

test('successful concert pays and levels once, first goals persist, final response replay uses the current balance', async () => {
  await db.query('update players set xp=95,level=1 where id=$1',[player])
  const initial = await start()
  const terminalRequest = id()
  const result = await solve(initial,player,new Set(),terminalRequest)
  assert.equal(result.show.status,'finished')
  assert.equal(result.show.result.rank,'S')
  assert.equal(result.show.result.coins,135)
  assert.equal(result.show.result.bonus,75)
  assert.equal(result.show.result.goal,true)
  assert.equal(result.player.coins,initial.player.coins+135)
  assert.equal(result.player.level,2)
  assert.equal(result.player.xp,15)
  assert.deepEqual(result.career.completed,[0])
  assert.deepEqual(result.career.goals,[0])
  assert.equal(result.career.paid_today,1)
  await db.query('update players set coins=coins+7 where id=$1',[player])
  const replay = await next(result.show,terminalRequest)
  assert.deepEqual(replay.show.result,result.show.result)
  assert.equal(replay.player.coins,result.player.coins+7)
  assert.equal(replay.career.paid_today,1)
  const second = await solve(await start())
  assert.equal(second.show.result.coins,60)
  assert.equal(second.show.result.first,false)
  assert.equal(second.show.result.goalFirst,false)
})

test('C grants no money or opening; UTC five-show cap preserves progress and reputation', async () => {
  const initial = await start(1)
  const failed = await solve(initial,player,new Set([0,1,2,3,4,5,6,7,8,9,10,11]))
  assert.equal(failed.show.result.rank,'C')
  assert.equal(failed.player.coins,initial.player.coins)
  assert.equal(failed.show.result.xp,0)
  assert.deepEqual(failed.career.completed,[0])
  await db.query('update concert_careers set paid_today=4 where player_id=$1',[player])
  const fifth = await solve(await start())
  assert.equal(fifth.show.result.paid,true)
  assert.equal(fifth.career.paid_today,5)
  const sixthInitial = await start(1)
  const sixth = await solve(sixthInitial)
  assert.equal(sixth.show.result.paid,false)
  assert.equal(sixth.show.result.coins,0)
  assert.equal(sixth.show.result.xp,0)
  assert.equal(sixth.player.coins,sixthInitial.player.coins)
  assert.equal(sixth.career.reputation,sixthInitial.career.reputation+25)
  assert.deepEqual(sixth.career.completed,[0,1])
  assert.deepEqual(sixth.career.goals,[0,1])
  await db.query("update concert_careers set paid_day=(clock_timestamp() at time zone 'UTC')::date-1 where player_id=$1",[player])
  assert.equal((await act('get')).career.paid_today,0)
})

test('purchases use main coins with idempotent charging; insufficient funds never create ownership', async () => {
  await assert.rejects(act('buy',{itemId:'marks'},id(),other),/NOT_ENOUGH_COINS/)
  assert.deepEqual((await act('get',{},null,other)).career.upgrades,[])
  const before = await act('get')
  const request = id()
  const bought = await act('buy',{itemId:'marks'},request)
  assert.equal(bought.player.coins,before.player.coins-250)
  assert.deepEqual(bought.career.upgrades,['marks'])
  assert.equal((await act('buy',{itemId:'marks'},request)).player.coins,bought.player.coins)
  await assert.rejects(act('buy',{itemId:'knobs'},request),/IDEMPOTENCY_CONFLICT/)
  await assert.rejects(act('buy',{itemId:'marks'}),/ALREADY_OWNED/)
})

test('migration replays; browser roles have no access and service_role calls invoker RPC with RLS bypass', async () => {
  for (const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(file=>/_concert_(career|hold_network_tolerance)\.sql$/.test(file)).sort()) {
    await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
  }
  for (const role of ['anon','authenticated']) {
    for (const table of ['concert_careers','concert_shows','concert_requests']) {
      assert.equal(await rpc('select has_table_privilege($1,$2,\'select\') result',[role,table]),false)
      assert.equal(await rpc('select relrowsecurity result from pg_class where oid=$1::regclass',[table]),true)
    }
    for (const fn of ['concert_action(uuid,text,jsonb,uuid)','concert_resolve(uuid,boolean,text)','concert_events(integer,text,text[])','concert_view(uuid,uuid)']) assert.equal(await rpc('select has_function_privilege($1,$2,\'execute\') result',[role,fn]),false)
  }
  assert.equal(await rpc("select prosecdef result from pg_proc where oid='concert_action(uuid,text,jsonb,uuid)'::regprocedure"),false)
  await db.exec('set role service_role')
  try { assert.equal((await act('get')).player.id,player) } finally { await db.exec('reset role') }
})
