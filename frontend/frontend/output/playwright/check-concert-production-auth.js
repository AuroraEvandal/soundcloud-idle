async page => {
  await page.unrouteAll({behavior:'wait'})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('https://soundcloud-idle.vercel.app/concert.html')
  await page.getByRole('heading',{name:'Нужен вход через Telegram'}).waitFor()
  const text=await page.locator('[role="alert"]').innerText()
  if(!text.includes('Telegram'))throw new Error('Expected Telegram authentication gate')
  if(await page.getByRole('button',{name:'Заступить на смену ↗'}).count())throw new Error('Production fell back to local demo')
  if(errors.length)throw new Error(JSON.stringify(errors))
  return {production:true,telegramAuthRequired:true,noDemoFallback:true,javascriptErrors:errors.length}
}
