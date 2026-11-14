const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
async function open(opts={}){
  const b=await chromium.launch();
  const ctx=await b.newContext(Object.assign({viewport:{width:1600,height:1000},deviceScaleFactor:1,locale:'lt-LT'},opts));
  await ctx.route(/\/_next\/static\//, async route=>{
    const u=route.request().url().replace(/%28/g,'(').replace(/%29/g,')');
    try{
      const body=execFileSync('curl',['-sS','-g','--max-time','30',u],{maxBuffer:64<<20});
      const ct=u.endsWith('.css')?'text/css':u.endsWith('.woff2')?'font/woff2':'application/javascript';
      await route.fulfill({status:200,body,headers:{'content-type':ct}});
    }catch(e){await route.continue();}
  });
  return {b,ctx};
}
module.exports={open};
