# Remote disposable process only. Never print material to logs; stdout is a private pipe.
import sys,json,re,hashlib,unicodedata,datetime,urllib.request
from html.parser import HTMLParser
def fail(code): raise RuntimeError(code)
def digest(b): return hashlib.sha256(b).hexdigest()
def norm(s): return re.sub(r'\s+',' ',unicodedata.normalize('NFC',s).replace('\xa0',' ')).strip()
class Node:
 def __init__(self,tag='',attrs=()): self.tag=tag;self.attrs=dict(attrs);self.children=[];self.parent=None;self.closed=False;self.bad_close=False
 def text(self): return ''.join(x if isinstance(x,str) else x.text() for x in self.children)
class Tree(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
 def handle_starttag(self,t,a):
  n=Node(t,a);n.parent=self.stack[-1];self.stack[-1].children.append(n)
  if t not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'): self.stack.append(n)
  else:n.closed=True
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==t:
    self.stack[i].closed=True
    if i!=len(self.stack)-1:self.stack[i].bad_close=True
    self.stack=self.stack[:i];return
 def handle_data(self,d): self.stack[-1].children.append(d)
def nodes(n):
 yield n
 for c in n.children:
  if isinstance(c,Node): yield from nodes(c)
def tree(s):
 p=Tree();p.feed(s);p.close();return p.root
def excluded(n):
 while n is not None:
  tokens=set((n.attrs.get('class','')+' '+n.attrs.get('id','')).lower().split())
  if n.tag in ('nav','header','footer') or n.attrs.get('role')=='navigation' or tokens.intersection({'toc','table-of-contents','table_of_contents'}):return True
  n=n.parent
 return False
def below(n,ancestor):
 while n is not None:
  if n is ancestor:return True
  n=n.parent
 return False
def extract(s):
 root=tree(s);allnodes=list(nodes(root))
 titles=[norm(n.text()) for n in allnodes if n.tag=='title']
 if len(titles)!=1 or 'Attribution 4.0 International' not in titles[0]:fail('material_title_mismatch')
 heads=[n for n in allnodes if n.tag in ('h1','h2','h3','h4','h5','h6') and not excluded(n)]
 patterns=[r'Section\s+1\s*[.\-–—:]\s*Definitions\.?',r'Section\s+2\s*[.\-–—:]\s*Scope\.?']
 bounds=[]
 for number,pattern in enumerate(patterns,1):
  candidates=[n for n in heads if re.match(r'Section\s+'+str(number)+r'\b',norm(n.text()),re.I)]
  if not candidates:fail('selection_missing_section_'+str(number))
  if len(candidates)!=1:fail('selection_duplicate_heading')
  if not re.fullmatch(pattern,norm(candidates[0].text()),re.I):fail('selection_malformed_heading')
  bounds.append(candidates[0])
 start,end=bounds
 i,j=allnodes.index(start),allnodes.index(end)
 if i>=j:fail('selection_boundary_order')
 if start.tag!=end.tag:fail('selection_heading_level_mismatch')
 selected_nodes=allnodes[i:j]
 if any(n in heads and n is not start for n in selected_nodes):fail('selection_unexpected_heading')
 lists=[n for n in selected_nodes if n.tag=='ol' and not any(below(n,p) and p is not n and p.tag=='ol' for p in selected_nodes)]
 if len(lists)!=1:fail('selection_definition_structure')
 definitions=lists[0]
 children=[n for n in definitions.children if isinstance(n,Node)]
 if len(children)!=11 or any(n.tag!='li' for n in children) or any(isinstance(n,str) and norm(n) for n in definitions.children):fail('selection_definition_count')
 allowed={'h1','h2','h3','h4','h5','h6','div','section','article','main','ol','ul','li','p','a','span','strong','em','b','i','u','sup','sub','br','abbr','cite','code','small'}
 if any(n.tag not in allowed or excluded(n) for n in selected_nodes):fail('selection_forbidden_element')
 if any(n.bad_close or not n.closed for n in selected_nodes if n.tag!='br'):fail('selection_malformed_structure')
 # Actual heading nodes delimit the traversal. Cross-references, URL and @ text
 # have no boundary semantics. No strings from beyond end are retained.
 active=False;finished=False;parts=[]
 def walk(n):
  nonlocal active,finished
  if n is start:active=True
  if n is end:active=False;finished=True;return
  block=n.tag in ('h1','h2','h3','h4','h5','h6','p','li','ol','ul','div','section','br')
  if active and block:parts.append('\n')
  for c in n.children:
   if isinstance(c,Node):walk(c)
   elif active:
    if norm(c) and not (below(n,start) or below(n,definitions)):fail('selection_unexpected_text')
    parts.append(c)
  if active and block:parts.append('\n')
 walk(root)
 if not finished:fail('selection_unterminated')
 raw=''.join(parts);selected=norm(raw)
 if not selected:fail('selection_empty')
 return selected,{'method':'heading-range-dom-text-v2','start':'Section 1: Definitions','end_exclusive':'Section 2: Scope','definition_count':11,'normalization':'HTML entities decoded; block boundaries to whitespace; NFC; NBSP to space; whitespace collapsed; trimmed; UTF-8, no trailing newline; generated list markers omitted','raw_selected_text_sha256':digest(raw.encode()),'bytes':len(selected.encode()),'sha256':digest(selected.encode()),'forbidden_elements':False}
def fetch(url):
 # Exactly one request per designated page in the newly authorized retry.
 for attempt in range(1):
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
   fail('retrieval_failed')
def main():
 if len(sys.argv)>1 and sys.argv[1]=='--self-test':
  import runpy,pathlib
  result=runpy.run_path(str(pathlib.Path(__file__).with_name('parserRegression.py')))['run'](extract)
  print(json.dumps(result));return
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
  allowed={'selection_missing_section_1','selection_missing_section_2','selection_duplicate_heading','selection_malformed_heading','selection_heading_level_mismatch','selection_unexpected_heading','selection_definition_structure','selection_definition_count','selection_forbidden_element','selection_malformed_structure','selection_unexpected_text','selection_unterminated','material_title_mismatch','selection_boundary_mismatch','selection_boundary_order','selection_forbidden_or_unterminated','selection_discrepancy','selection_empty','selection_section_marker_detected','selection_contact_marker_detected','selection_url_marker_detected','unexpected_redirect','response_limit','retrieval_failed','rights_evidence_discrepancy','synthetic_extraction_failure'}
  print(json.dumps({'error':str(e) if str(e) in allowed else 'capture_failed'}));sys.exit(1)
