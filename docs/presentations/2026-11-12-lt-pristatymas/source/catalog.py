import re,json,collections
L=open('docs/program/FUNCTION_REGISTER.md',encoding='utf8').read().split('\n')
def cells(l): return [c.strip() for c in l.strip().strip('|').split('|')]
status={};lt={};groups={}
sec=None
for i,l in enumerate(L):
    if l.startswith('## '): sec=l
    if l.startswith('### Map: functions'): sec='MAP'
    if l.startswith('### Map: groups'): sec='GROUPS'
    if l.startswith('### ') and 'Map: functions' not in l and 'Map: groups' not in l and sec in('MAP','GROUPS'): sec='X'
    if not l.startswith('| '): continue
    c=cells(l)
    if sec=='GROUPS' and c[0].isdigit(): groups[c[0]]=c[1]
    if not re.match(r'^\d+\.\d+$',c[0]): continue
    if sec=='MAP' and c[0] not in lt: lt[c[0]]=c
    elif 908<=i+1<=1262 and c[0] not in status and len(c)>=7: status[c[0]]=c
CAT={'LIVE_VERIFIED':'VEIKIA','PASS_CI_ONLY':'SUKURTA / TIKRINAMA','NOT_VERIFIED':'SUKURTA / TIKRINAMA','BLOCKED':'SUKURTA / TIKRINAMA','FAIL':'SUKURTA / TIKRINAMA','NOT_IMPLEMENTED':'PLANUOJAMA'}
NOTE={'PASS_CI_ONLY':'praeina automatinius testus, produkcijoje nepatvirtinta','NOT_VERIFIED':'produkcijoje dar nepatikrinta','BLOCKED':'sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos','FAIL':'rasta klaida, taisoma','NOT_IMPLEMENTED':'dar nesukurta'}
rows=[];cnt=collections.Counter()
for k in sorted(status,key=lambda x:tuple(map(int,x.split('.')))):
    s=status[k]; st=s[2]
    if st not in CAT: continue
    m=lt.get(k)
    name=m[1] if m else s[1]; what=m[2] if m else ''; who=m[3] if m else ''; where=m[4] if m else ''
    rows.append(dict(id=k,g=k.split('.')[0],name=name,what=what,who=who,where=where,raw=st,cat=CAT[st],date=s[3],ev=s[4][:200]))
    cnt[CAT[st]]+=1
json.dump(dict(rows=rows,groups=groups),open('/tmp/claude-0/-home-user-labourmarketai/9d90af5e-3497-57b2-9ef1-78fd93b719d2/scratchpad/catalog.json','w'),ensure_ascii=False)
print(cnt,len(rows),collections.Counter(r['raw'] for r in rows))
print(sum(1 for r in rows if not r['what']),'without LT text')
