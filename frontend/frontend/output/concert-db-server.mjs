import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
const require = createRequire(new URL('../../../supabase/package.json', import.meta.url))
const { PGlite } = require('@electric-sql/pglite')
const db = new PGlite()
const root = new URL('../../../', import.meta.url)
await db.exec('create role anon; create role authenticated; create role service_role;')
await db.exec(await readFile(new URL('backend/schema.sql',root),'utf8'))
for (const file of (await readdir(new URL('supabase/migrations/',root))).sort()) await db.exec(await readFile(new URL(`supabase/migrations/${file}`,root),'utf8'))
await db.exec(await readFile(new URL('backend/seed.sql',root),'utf8'))
const player = '00000000-0000-4000-8000-000000000077'
await db.query('insert into players(id,telegram_id,username,coins) values($1,999999999777,$2,5000)',[player,'Концерт QA'])
const headers = {'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,GET,OPTIONS'}
createServer(async (req,res) => {
  if(req.method==='OPTIONS'){res.writeHead(200,headers);res.end('');return}
  if(req.method==='GET'){res.writeHead(200,headers);res.end(JSON.stringify((await db.query('select coins,xp,level from players where id=$1',[player])).rows[0]));return}
  let text='';for await(const part of req)text+=part
  try{
    const {action,initData,requestId,...payload}=JSON.parse(text)
    const result=(await db.query('select concert_action($1,$2,$3::jsonb,$4::uuid) data',[player,action,JSON.stringify(payload),requestId||null])).rows[0].data
    const p=result.player
    result.player={id:p.id,username:p.username,coins:p.coins,xp:p.xp,level:p.level,popularity:p.popularity,streams:p.streams||0,xp_to_next:Math.round(100*1.1**(p.level-1)),skills:{rhyme:p.skill_rhyme,flow:p.skill_flow,punch:p.skill_punch,charisma:p.skill_charisma}}
    res.writeHead(200,headers);res.end(JSON.stringify(result))
  }catch(e){res.writeHead(400,headers);res.end(JSON.stringify({error:{code:e.message}}))}
}).listen(54329,'127.0.0.1',()=>console.log('Concert SQL fixture ready on 54329'))
