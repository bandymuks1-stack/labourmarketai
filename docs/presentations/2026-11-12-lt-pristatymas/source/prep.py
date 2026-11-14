from PIL import Image
S='/tmp/claude-0/-home-user-labourmarketai/9d90af5e-3497-57b2-9ef1-78fd93b719d2/scratchpad/img/'
J={
'landing':('docs/audits/evidence/owner-rebuild-after/prod-after-landing-1440-hero.png',(0,60,1440,900)),
'jobs':('docs/design/ux-system-2026-11/evidence/p0-3-job-cards/after-anonymous-1440.png',(255,60,1140,900)),
'signup':('docs/design/ux-system-2026-11/evidence/p0-1-signup/after-local-1440.png',(380,30,1060,900)),
'profile':('docs/audits/evidence/w7-s4/after-employer-profile-1440.png',(0,0,1440,900)),
'need':('docs/audits/evidence/labour-market-os-planning-zone-v1/company-need-1440x900.png',(300,0,1140,900)),
'network':('docs/audits/evidence/w7-s4/after-company-network-1440.png',(0,0,1440,900)),
'project':('docs/audits/evidence/premium-rebuild/w3/rows23-project-detail-1440.png',(0,0,1440,900)),
'journal':('docs/audits/screenshots/journal-evidence-desktop-lt.png',(0,0,1440,900)),
'chat':('docs/audits/evidence/owner-rebuild-after/chat-1440.png',(0,0,1440,900)),
'services':('docs/audits/evidence/final-completion/ux-audit/worker-dashboard_services-1440.png',(0,0,1440,620)),
'projects':('docs/audits/evidence/w7-ux-audit/company-projects-1440.png',(0,0,1440,900)),
'requests':('docs/design/ux-system-2026-11/evidence/pr2828-foldin/after-service-requests-1440.png',(0,0,1440,500)),
}
for k,(f,b) in J.items():
    im=Image.open(f).convert('RGB'); print(k,im.size)
    x0,y0,x1,y1=b; x1=min(x1,im.width); y1=min(y1,im.height)
    im.crop((x0,y0,x1,y1)).save(S+k+'.png')
