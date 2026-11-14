async page => {
  const errors=[],seen=new Set(),shots=new Set();let snapshot
  page.on('pageerror',e=>errors.push(e.message))
  page.on('response',async response=>{if(response.url().includes('/functions/v1/concert')&&response.status()===200){try{snapshot=await response.json()}catch{}}})
  await page.goto('http://127.0.0.1:5175/concert.html')
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Заступить на смену ↗'}).click()
  await page.getByRole('button',{name:'Выйти к сцене ↗'}).click()
  await page.getByRole('button',{name:/01 Довериться артисту/}).click()
  await page.getByRole('button',{name:'Начать концерт'}).click()
  await page.getByRole('slider',{name:'Частота эквалайзера'}).waitFor({timeout:20000})
  await page.getByRole('button',{name:'Пауза',exact:true}).click()
  await page.getByRole('button',{name:'Продолжить концерт ↗'}).waitFor()
  await page.reload()
  await page.getByRole('button',{name:'Продолжить выступление ↗'}).click()
  await page.getByRole('button',{name:'Пауза',exact:true}).waitFor()
  const limit=Date.now()+130000
  while(Date.now()<limit){
    if(await page.locator('.ct-result').count())break
    const s=snapshot?.show,e=s?.events[s.scene_index]
    if(!e||s.outcomes[e.id]){await page.waitForTimeout(70);continue}
    seen.add(e.kind)
    if(!shots.has(e.kind)){shots.add(e.kind);await page.screenshot({path:`output/playwright/full-concert-${e.kind}.png`})}
    const step=s.scene_progress.step||0
    await page.evaluate(({e,step})=>{
      const cue=document.querySelector('.ct-cue');if(!cue||cue.dataset.kind!==e.kind)return
      function click(button){if(button&&!button.disabled)button.click()}
      if(e.kind==='frequency'){
        const marker=document.querySelector('.ct-target-track>i'),knob=document.querySelector('.ct-knob')
        const target=parseFloat(marker.style.left)+parseFloat(marker.style.width)/2,value=Number(knob.getAttribute('aria-valuenow'))
        if(Math.abs(value-target)>1)knob.dispatchEvent(new KeyboardEvent('keydown',{key:value<target?'ArrowUp':'ArrowDown',bubbles:true}))
        else knob.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
      }
      if(['level','crossfade'].includes(e.kind)){
        const input=document.querySelector('.ct-fader-zone input'),marker=input.previousElementSibling
        const target=parseFloat(marker.style.left)+parseFloat(marker.style.width)/2
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(Math.round(target)))
        input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))
        click(document.querySelector('.ct-secondary-cue'))
      }
      const index=e.sequence?.[step]
      if(e.kind==='pads')click(document.querySelectorAll('.ct-pads button')[index])
      if(e.kind==='patch')click(document.querySelectorAll('.ct-patch-outputs button')[index])
      if(e.kind==='blackout')click(document.querySelectorAll('.ct-memory-pads button')[index])
      if(e.kind==='power')click(document.querySelectorAll('.ct-power-rack button')[index])
      if(e.kind==='feedback')click(document.querySelector('.ct-channels .ct-overload')||document.querySelector('.ct-channels .is-muted'))
      if(e.kind==='artist')click(document.querySelector('.ct-command'))
    },{e,step})
    await page.waitForTimeout(65)
  }
  await page.locator('.ct-result').waitFor({timeout:3000})
  if(seen.size!==9)throw new Error('Missingmechanics:'+JSON.stringify([...seen]))
  if(!snapshot.show.result.paid)throw new Error('No server payout: '+JSON.stringify(snapshot.show.result))
  const expected=5000+snapshot.show.result.coins
  if(snapshot.player.coins!==expected)throw new Error('Balance mismatch')
  await page.screenshot({path:'output/playwright/full-concert-result.png'})
  await page.getByRole('button',{name:/Обновить пульт/}).click()
  await page.getByRole('button',{name:'250 ₽ · Установить'}).click()
  await page.getByRole('button',{name:'Установлено ✓'}).waitFor()
  if(snapshot.player.coins!==expected-250)throw new Error('Purchase did not debit server balance')
  await page.reload()
  await page.getByRole('button',{name:'Твой пульт 1/5'}).click()
  await page.getByRole('button',{name:'Установлено ✓'}).waitFor()
  await page.setViewportSize({width:320,height:740})
  await page.screenshot({path:'output/playwright/full-concert-shop-320.png'})
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal overflow')
  if(errors.length)throw new Error(JSON.stringify(errors))
  return {mechanics:[...seen],result:snapshot.show?.result,coins:snapshot.player.coins,persisted:true,errors}
}
