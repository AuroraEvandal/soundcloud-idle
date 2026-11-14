// Browser → real Edge handlers (including Telegram HMAC) → temporary PostgreSQL.
// Usage: node tools/check-game-days.mjs <absolute path to playwright/index.mjs>
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build, preview } from 'vite'
import { PGlite } from '../../../supabase/node_modules/@electric-sql/pglite/dist/index.js'
import { composedBeat } from '../tests/fixtures/beat.mjs'

const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'playwright')
const root = new URL('../../../',import.meta.url)
const db = new PGlite()
const owner=crypto.randomUUID(), token='local-smoke-bot-token'
let server, browser, page, lostNight=false
const rpc=async(sql,args=[]) => (await db.query(sql,args)).rows[0].result
const state=()=>rpc('select to_jsonb(p) result from players p where id=$1',[owner])
const output=new URL('output/playwright/',root)
await mkdir(output,{recursive:true})
const handlers=new Map(), calls=[]
globalThis.Deno={env:{get:()=>token},serve:handler=>{globalThis.lastEdgeHandler=handler}}
globalThis.daysSqlClient={
  from(table) {
    assert.equal(table,'players')
    return { select() {return this}, eq(field,value) {this.field=field;this.value=value;return this},
      async maybeSingle() {
        try {return {data:await rpc(`select to_jsonb(p) result from players p where ${this.field}=$1`,[this.value])}}
        catch(error) {return {error}}
      } }
  },
  async rpc(name,args) {
    try {
      assert.match(name,/^[a-z_]+$/)
      const keys=Object.keys(args)
      keys.forEach(key=>assert.match(key,/^p_[a-z_]+$/))
      return {data:await rpc(`select ${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) result`,Object.values(args))}
    } catch(error) { return {error} }
  },
}
const hooks=registerHooks({resolve(specifier,context,next) {
  if(specifier==='npm:@supabase/supabase-js@2') return {
    url:'data:text/javascript,export const createClient=()=>globalThis.daysSqlClient',shortCircuit:true,
  }
  return next(specifier,context)
}})
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  await db.exec(await readFile(new URL('backend/schema.sql',root),'utf8'))
  for(const file of (await readdir(new URL('supabase/migrations/',root))).sort()) await db.exec(await readFile(new URL(`supabase/migrations/${file}`,root),'utf8'))
  await db.exec(await readFile(new URL('backend/seed.sql',root),'utf8'))
  await db.query("insert into players(id,telegram_id,username,selected_beat_id) values($1,123456,'Проверка',1)",[owner])
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards',[owner])
  await db.query('insert into player_beats(player_id,beat_id) values($1,1)',[owner])
  for(const name of ['end-day','buy-consumable','record-beat','release-beat','get-studio','record-snippet']) {
    await import(new URL(`supabase/functions/${name}/index.ts`,root).href)
    handlers.set(name,globalThis.lastEdgeHandler)
  }
  const {playerView}=await import(new URL('supabase/functions/_shared/common.ts',root).href)
  hooks.deregister()
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456,username:'Проверка'})})
  const check=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n')
  const secret=createHmac('sha256','WebAppData').update(token).digest()
  params.set('hash',createHmac('sha256',secret).update(check).digest('hex'))
  const buildOptions={root:fileURLToPath(new URL('../',import.meta.url)),logLevel:'error',
    build:{outDir:fileURLToPath(new URL('output/days-browser-build/',root))},
    define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:54329'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('local-smoke-public-key')}}
  await build(buildOptions)
  server=await preview({...buildOptions,preview:{port:5184,strictPort:true,host:'127.0.0.1'}})
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
  page=await browser.newPage({viewport:{width:390,height:844}})
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({status:200,body:''}))
  await page.addInitScript(({owner,initData,composition})=>{
    window.Telegram={WebApp:{ready(){},expand(){},initData,initDataUnsafe:{user:{id:123456,username:'Проверка'}}}}
    localStorage.setItem(`sw_intro_v1:${owner}`,'done')
    if(!localStorage.getItem(`sw_beat_draft_v2:${owner}`)) localStorage.setItem(`sw_beat_draft_v2:${owner}`,JSON.stringify(composition))
  },{owner,initData:params.toString(),composition:{...composedBeat(),name:'Три дня'}})
  await page.route('**/functions/v1/*',async route=>{
    const request=route.request(), name=new URL(request.url()).pathname.split('/').at(-1)
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'}
    if(request.method()==='OPTIONS') return route.fulfill({status:200,headers,body:'{}'})
    calls.push(name)
    try {
      if(handlers.has(name)) {
        const response=await handlers.get(name)(new Request(request.url(),{method:'POST',body:request.postData(),headers:{'content-type':'application/json'}}))
        const body=await response.text()
        if(name==='end-day'&&!lostNight) {lostNight=true;return route.fulfill({status:500,headers,body:'{"error":{"code":"INTERNAL"}}'})}
        return route.fulfill({status:response.status,headers,body})
      }
      const p=await state(), player=playerView(p)
      let result
      if(name==='login') result={is_new:false,player}
      else if(name==='get-profile') result={player,stats:{battles_played:0,wins:0,losses:0},opponents:[],recent_battles:[]}
      else if(name==='get-pets') result=await rpc('select pets_view($1) result',[owner])
      else if(name==='get-wardrobe') result={player,items:[],outfit:{},bonuses:{income_pct:0,popularity_pct:0,charisma:0}}
      else if(name==='get-shop') result={player,clothing:[],equipment:[],packs:[],consumables:[{id:'energy_drink',name:'Энергетик',price:100,energy:50}]}
      else if(name==='get-beatmaker') result={player,energy:p.energy,energy_cost:50,next_cursor:null,
        beats:(await db.query('select * from player_recorded_beats where player_id=$1 order by created_at desc',[owner])).rows.map(b=>({...b,instant_sale_coins:84,collectable_coins:0,collectable_streams:0}))}
      else throw new Error(`Unexpected route ${name}`)
      return route.fulfill({status:200,headers,body:JSON.stringify(result)})
    } catch(error) {console.error(name,error);return route.fulfill({status:500,headers,body:JSON.stringify({error:{code:'INTERNAL'}})})}
  })
  await page.goto('http://127.0.0.1:5184')
  await page.getByRole('button',{name:'Завершить день',exact:true}).waitFor()
  await page.locator('.appicon[aria-label="Студия"]').click()
  await page.getByText('Прогресс записи',{exact:true}).waitFor()
  await page.getByRole('tab',{name:'Beat Lab',exact:true}).click()
  await page.getByRole('button',{name:/Записать бит/}).click()
  await page.getByRole('button',{name:/Выпустить на стриминг/}).click()
  await page.getByText('Начислено частей: 1/3',{exact:true}).waitFor()
  assert.equal((await state()).energy,50)
  await page.getByRole('button',{name:'Назад',exact:true}).click()
  await page.getByRole('button',{name:'Завершить день',exact:true}).click()
  await page.getByRole('button',{name:'Лечь спать',exact:true}).click()
  await page.getByText('Ошибка сервера. Попробуй ещё раз',{exact:true}).waitFor()
  await page.reload()
  await page.getByRole('heading',{name:'Наступил день 2',exact:true}).waitFor()
  assert.equal((await state()).game_day,2)
  await page.screenshot({path:fileURLToPath(new URL('days-night-390.png',output))})
  await page.getByRole('button',{name:'Начать день',exact:true}).click()
  await page.getByText(/Забыл про свой долг/).waitFor()
  await page.locator('.grid .appicon[aria-label="Магазин"]').click()
  await page.getByRole('tab',{name:'Магазин',exact:true}).click()
  const before=(await state()).coins
  await page.getByRole('button',{name:'Купить и выпить',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.resbar')?.textContent.includes('⚡150'))
  assert.equal((await state()).coins,before-100)
  await page.getByRole('button',{name:'Назад',exact:true}).click()
  await page.getByRole('button',{name:'Завершить день',exact:true}).click()
  await page.getByRole('button',{name:'Лечь спать',exact:true}).click()
  await page.getByRole('heading',{name:'Наступил день 3',exact:true}).waitFor()
  assert.equal((await state()).energy,150)
  const beat=await rpc('select to_jsonb(b) result from player_recorded_beats b where player_id=$1',[owner])
  assert.equal(beat.installments_paid,3)
  await page.getByRole('button',{name:'Начать день',exact:true}).click()
  await page.setViewportSize({width:320,height:740})
  await page.screenshot({path:fileURLToPath(new URL('days-home-320.png',output))})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.getByRole('button',{name:'Завершить день',exact:true}).click()
  await page.getByRole('button',{name:'Лечь спать',exact:true}).click()
  await page.getByRole('heading',{name:'Наступил день 4',exact:true}).waitFor()
  assert.equal((await state()).debt_remaining,900)
  assert.equal((await db.query('select count(*)::int n from day_requests where player_id=$1',[owner])).rows[0].n,3)
  await page.getByRole('button',{name:'Начать день',exact:true}).click()
  await db.query('update players set coins=0 where id=$1',[owner])
  await page.reload()
  for(const next of [5,6]) {
    await page.getByRole('button',{name:'Завершить день',exact:true}).click()
    await page.getByRole('button',{name:'Лечь спать',exact:true}).click()
    await page.getByRole('heading',{name:`Наступил день ${next}`,exact:true}).waitFor()
    await page.getByRole('button',{name:'Начать день',exact:true}).click()
  }
  await page.getByRole('button',{name:'Завершить день',exact:true}).click()
  await page.getByRole('button',{name:'Лечь спать',exact:true}).click()
  await page.getByRole('heading',{name:'Кредитор забрал всё',exact:true}).waitFor()
  assert.equal((await state()).game_run,2)
  assert.equal((await state()).coins,300)
  await page.screenshot({path:fileURLToPath(new URL('days-reset-320.png',output))})
  await page.getByRole('button',{name:'Начать заново',exact:true}).click()
  await page.getByText('День 1',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({result:'passed',installments:3,lostResponseRecovered:true,overflowPreserved:true,
    firstDebtPayment:true,thirdMissReset:true,finalRun:2,finalDay:1,calls,errors},null,2))
} catch(error) {
  if(page) {
    await page.screenshot({path:fileURLToPath(new URL('days-error.png',output))})
    console.error('Browser state:',await page.locator('body').innerText())
    console.error('Calls:',calls)
  }
  throw error
} finally {
  hooks.deregister()
  await browser?.close()
  if(server) await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()))
  await db.close()
}
