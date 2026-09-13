# Remote disposable process only. Never print material to logs; stdout is a private pipe.
import sys,json,re,hashlib,unicodedata,datetime,urllib.request
from html.parser import HTMLParser
def fail(code): raise RuntimeError(code)
def digest(b): return hashlib.sha256(b).hexdigest()
def norm(s): return re.sub(r'\s+',' ',unicodedata.normalize('NFC',s).replace('\xa0',' ')).strip()
class Node:
 def __init__(self,tag='',attrs=()): self.tag=tag;self.attrs=dict(attrs);self.children=[]
 def text(self): return ''.join(x if isinstance(x,str) else x.text() for x in self.children)
class Tree(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
 def handle_starttag(self,t,a):
  n=Node(t,a);self.stack[-1].children.append(n)
  if t not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'): self.stack.append(n)
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==t: self.stack=self.stack[:i];return
 def handle_data(self,d): self.stack[-1].children.append(d)
def nodes(n):
 yield n
 for c in n.children:
  if isinstance(c,Node): yield from nodes(c)
def tree(s):
 p=Tree();p.feed(s);p.close();return p.root
def extract(s):
 root=tree(s);allnodes=list(nodes(root))
 titles=[norm(n.text()) for n in allnodes if n.tag=='title']
 if len(titles)!=1 or 'Attribution 4.0 International' not in titles[0]: fail('material_title_mismatch')
 heads=[n for n in allnodes if n.tag in ('h1','h2','h3','h4','h5','h6')]
 start=[n for n in heads if re.fullmatch(r'Section\s+1\s*[.\-–—:]?\s*Definitions\.?',norm(n.text()),re.I)]
 end=[n for n in heads if re.fullmatch(r'Section\s+2\s*[.\-–—:]?\s*Scope\.?',norm(n.text()),re.I)]
 if len(start)!=1 or len(end)!=1: fail('selection_boundary_mismatch')
 active=False;finished=False;parts=[];forbidden=False
 def walk(n):
  nonlocal active,finished,forbidden
  if n is start[0]: active=True
  if n is end[0]:
   if not active: fail('selection_boundary_order')
   active=False;finished=True;return
  if active and n.tag in ('nav','header','footer','script','style','img','svg','form','address'): forbidden=True
  if n.tag in ('script','style','nav','header','footer'): return
  block=n.tag in ('h1','h2','h3','h4','p','li','ol','ul','div','br')
  if active and block:parts.append('\n')
  for c in n.children:
   if isinstance(c,Node): walk(c)
   elif active:parts.append(c)
  if active and block:parts.append('\n')
 walk(root)
 if not finished or forbidden: fail('selection_forbidden_or_unterminated')
 raw=''.join(parts);selected=norm(raw)
 if not selected:fail('selection_empty')
 if re.search(r'Section\s+2\b',selected):fail('selection_section_marker_detected')
 if '@' in selected:fail('selection_contact_marker_detected')
 if re.search(r'https?://',selected):fail('selection_url_marker_detected')
 return selected,{'method':'heading-range-dom-text-v1','start':'Section 1: Definitions','end_exclusive':'Section 2: Scope','normalization':'HTML entities decoded; block boundaries to whitespace; NFC; NBSP to space; whitespace collapsed; trimmed; UTF-8, no trailing newline; generated list markers omitted','raw_selected_text_sha256':digest(raw.encode()),'bytes':len(selected.encode()),'sha256':digest(selected.encode()),'forbidden_elements':False}
def fetch(url):
 # At most two network attempts per exact page, only transient retrieval/parsing.
 for attempt in range(2):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'MIP-isolated-permission-qualification/1.0','Accept':'text/html'})
   with urllib.request.urlopen(req,timeout=25) as r:
    final=r.geturl()
    if final.rstrip('/')!=url.rstrip('/'):fail('unexpected_redirect')
    b=r.read(2097153)
    if len(b)>2097152:fail('response_limit')
    text=b.decode('utf-8')
    return text,{'url':url,'final_url':final,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'document_sha256':digest(b),'bytes':len(b),'network_attempts':attempt+1}
  except RuntimeError:raise
  except Exception:
   if attempt==1:fail('retrieval_failed')
def main():
 if len(sys.argv)>1 and sys.argv[1]=='--self-test':
  sample='<title>Attribution 4.0 International</title><nav>outside</nav><h3>Section 1 – Definitions.</h3><ol><li>synthetic definition</li></ol><h3>Section 2 – Scope.</h3><p>outside</p>'
  text,meta=extract(sample)
  if 'outside' in text:fail('synthetic_extraction_failure')
  for bad in [sample.replace('Section 2','Section 3'),sample.replace('<ol>','<img><ol>')]:
   try:extract(bad)
   except RuntimeError:continue
   fail('synthetic_extraction_failure')
  print(json.dumps({'synthetic_parser_tests':3,'pass':3}));return
 source='https://creativecommons.org/licenses/by/4.0/legalcode.en'
 html,receipt=fetch(source);selected,selection=extract(html);del html
 evidence=[]
 for kind,url in [('policies','https://creativecommons.org/policies/'),('terms','https://creativecommons.org/terms/'),('cc0','https://creativecommons.org/publicdomain/zero/1.0/legalcode.en')]:
  html,obs=fetch(url);text=norm(tree(html).text())
  patterns={
   'policies':r'Creative Commons makes the legal code of its licenses and the CC0 Public Domain Dedication available under the CC0 Public Domain Dedication',
   'terms':r'Other than the text of Creative Commons licenses, CC0, and other legal tools and the text of the deeds for all legal tools \(all of which are made available under the CC0 Public Domain Dedication\)',
   'cc0':r'The text of the Creative Commons public licenses is dedicated to the public domain under the CC0 Public Domain Dedication'
  }
  m=re.search(patterns[kind],text,re.I)
  if not m:fail('rights_evidence_discrepancy')
  date=re.search(r'Effective as of (\d{1,2} \w+ \d{4})',text) if kind=='terms' else None
  evidence.append(dict(obs,kind=kind,clause_sha256=digest(m.group(0).encode()),effective_date_observed=date.group(1) if date else None))
  del html,text
 # This output travels only through subprocess PIPE, never the parent public stdout.
 print(json.dumps({'material_text':selected,'capture':receipt,'selection':selection,'rights':evidence},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except Exception as e:
  allowed={'material_title_mismatch','selection_boundary_mismatch','selection_boundary_order','selection_forbidden_or_unterminated','selection_discrepancy','selection_empty','selection_section_marker_detected','selection_contact_marker_detected','selection_url_marker_detected','unexpected_redirect','response_limit','retrieval_failed','rights_evidence_discrepancy','synthetic_extraction_failure'}
  print(json.dumps({'error':str(e) if str(e) in allowed else 'capture_failed'}));sys.exit(1)
