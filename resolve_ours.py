import re,sys
for p in sys.argv[1:]:
    s=open(p,encoding='utf-8',newline='').read()
    pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n.*?>>>>>>> [^\n]*\n',re.S)
    s2=pat.sub(lambda m:m.group(1),s)
    open(p,'w',encoding='utf-8',newline='').write(s2)
