async page => {
  const backend = [], errors = []
  page.on('request', request => { if (/supabase|functions\/v1|rest\/v1/.test(request.url())) backend.push(request.url()) })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('https://soundcloud-idle.vercel.app/concert.html')
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('heading', {name:'Спаси концерт.'}).waitFor()
  await page.getByRole('button', {name:'Заступить на смену ↗'}).click()
  await page.getByRole('button', {name:'Выйти к сцене ↗'}).click()
  await page.getByRole('button', {name:/01 Довериться артисту/}).click()
  await page.getByRole('button', {name:'Начать концерт'}).click()
  await page.getByRole('slider', {name:'Частота эквалайзера'}).waitFor({timeout:20000})
  await page.screenshot({path:'output/playwright/concert-production-demo.png'})
  await page.getByRole('button', {name:'Пауза',exact:true}).click()
  await page.getByRole('button', {name:'Закончить репетицию'}).click()
  if(backend.length || errors.length) throw new Error(JSON.stringify({backend,errors}))
  return {productionDemo:'passed', backendRequests:backend.length, javascriptErrors:errors.length}
}
