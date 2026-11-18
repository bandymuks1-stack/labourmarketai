const {open}=require('./lib'); const {devices}=require('playwright');
async function dismiss(p){ for(const t of ['Atsisakyti','Refuse']){ const b=p.getByRole('button',{name:t}); if(await b.count()) {await b.first().click().catch(()=>{}); await p.waitForTimeout(300);} } }
(async()=>{
 const {b,ctx}=await open({viewport:{width:1440,height:900},deviceScaleFactor:2}); const p=await ctx.newPage();
 const list=[['hero','/lt'],['companies','/lt/for-companies'],['workers','/lt/for-workers'],['agencies','/lt/for-agencies'],['jobs','/lt/jobs'],['pricing','/lt/pricing'],['signup','/lt/auth/signup'],['need','/lt/company-need'],['about','/lt/about'],['professions','/lt/professions'],['match','/lt/match-preview'],['market','/lt/labour-market'],['abroad','/lt/work-abroad']];
 for(const [n,u] of list){ await p.goto('https://labourmarket.ai'+u,{waitUntil:'networkidle',timeout:60000}); await dismiss(p); await p.waitForTimeout(800); await p.screenshot({path:'hd_'+n+'.png'}); await p.screenshot({path:'full_'+n+'.png',fullPage:true}); }
 // language options
 await p.goto('https://labourmarket.ai/lt',{waitUntil:'networkidle'}); 
 const langs=await p.evaluate(()=>[...document.querySelectorAll('select option, [role=option], a[hreflang]')].map(e=>(e.getAttribute('hreflang')||'')+':'+e.textContent.trim()).slice(0,40));
 console.log('LANGS',JSON.stringify(langs));
 await b.close();
 const m=await open({...devices['iPhone 14']}); const mp=await m.ctx.newPage();
 for(const [n,u] of [['m_hero','/lt'],['m_jobs','/lt/jobs'],['m_companies','/lt/for-companies']]){ await mp.goto('https://labourmarket.ai'+u,{waitUntil:'networkidle',timeout:60000}); await dismiss(mp); await mp.waitForTimeout(800); await mp.screenshot({path:n+'.png'}); }
 await m.b.close();
})();
