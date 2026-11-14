async page => {
  const nexts=[],errors=[];let snapshot,dropped=false
  page.on('pageerror',e=>errors.push(e.message))
  page.on('request',r=>{if(r.url().includes('/functions/v1/concert')){const b=r.postDataJSON();if(b?.action==='next')nexts.push(b)}})
  page.on('response',async r=>{if(r.url().includes('/functions/v1/concert')&&r.status()===200){try{snapshot=await r.json()}catch{}}})
  await page.route('**/functions/v1/concert*',async route=>{
    const b=route.request().postDataJSON()
    if(b.action==='next'&&!dropped){await route.fetch();dropped=true;await route.abort('failed')}else await route.continue()
  })
  await page.goto('http://127.0.0.1:5175/concert.html')
  await page.getByRole('button',{name:/Заступить на смену ↗|Вернуться на сцену ↗/}).click()
  await page.getByRole('button',{name:'Выйти к сцене ↗'}).click()
  await page.getByRole('button',{name:/02 Держаться сет-листа/}).click()
  await page.getByRole('button',{name:'Начать концерт'}).click()
  await page.getByRole('slider',{name:'Частота эквалайзера'}).waitFor()
  const end=Date.now()+15000
  while(!dropped&&Date.now()<end){
    await page.evaluate(()=>{const m=document.querySelector('.ct-target-track>i'),k=document.querySelector('.ct-knob');if(!m||!k)return;const t=parseFloat(m.style.left)+parseFloat(m.style.width)/2,v=Number(k.getAttribute('aria-valuenow'));k.dispatchEvent(new KeyboardEvent('keydown',{key:Math.abs(v-t)<=1?'Enter':v<t?'ArrowUp':'ArrowDown',bubbles:true}))})
    await page.waitForTimeout(70)
  }
  if(!dropped)throw new Error('Did not inject committed response loss')
  await page.waitForTimeout(250)
  await page.reload()
  await page.getByRole('button',{name:'Продолжить выступление ↗'}).click()
  await page.locator('.ct-cue[data-kind="pads"]').waitFor()
  const e=snapshot.show.events[snapshot.show.scene_index]
  for(const index of e.sequence){
    const response=page.waitForResponse(r=>r.url().includes('/functions/v1/concert')&&r.request().postDataJSON()?.action==='input')
    await page.locator('.ct-pads button').nth(index).click();await response
    await page.waitForTimeout(80)
  }
  await page.locator('.ct-cue[data-kind="level"]').waitFor()
  if(nexts.length<3||nexts[0].requestId!==nexts[1].requestId||nexts[1].requestId===nexts[2].requestId)throw new Error('Incorrect delivery identity recovery '+JSON.stringify(nexts))
  await page.getByRole('button',{name:'Пауза',exact:true}).click()
  await page.getByRole('button',{name:'Завершить без награды'}).click()
  if(errors.length)throw new Error(JSON.stringify(errors))
  return {committedLostResponseRecovered:true,replayedSameId:true,newSceneFreshId:true,advancedAfterReload:true,errors}
}

