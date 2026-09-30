# Frozen extraction-only reproduction from 97f53652b0bd4ec33f970d36dad819c0b8c8668e.
# Synthetic offline tests only; no retrieval entry point.
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
