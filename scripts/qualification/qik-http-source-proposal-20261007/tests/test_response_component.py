from pathlib import Path
import argparse,tarfile,hashlib,json,difflib,subprocess,tempfile
parser=argparse.ArgumentParser(description='Offline safe native callback component check; no HTTP, database or extension')
parser.add_argument('--evidence',required=True,type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=args.evidence;out.mkdir(parents=True,exist_ok=True)
new=(root/'src/http-bounded-response.c').read_bytes()
old=(root/'src/upstream-http-v1.6.3.c').read_bytes()
assert hashlib.sha256(old).hexdigest()=='20f27b859c1ed7bae3eb35e01db17a6855ff428dbcf1192d1c504a71e5d51d03'
patch=''.join(difflib.unified_diff(old.decode().splitlines(keepends=True),new.decode().splitlines(keepends=True),fromfile='a/http.c',tofile='b/http.c'))
# Compare an already prepared patch; never mutate proposal source during tests.
assert (root/'src/pgsql-http-bounded-response.patch').read_text()==patch
text=new.decode();start=text.index('static size_t\nhttp_writeback(');end=text.index('\n}\n',start)+3;callback=text[start:end]
source='''#include <assert.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\ntypedef struct {int len;unsigned char *data;} StringInfoData;\ntypedef StringInfoData *StringInfo;\nstatic int append_calls;\nstatic void appendBinaryStringInfo(StringInfo s,const char *data,int n) {\n assert(n>=0 && s->len>=0 && n<=65536-s->len); memcpy(s->data+s->len,data,(size_t)n);s->len+=n;append_calls++;\n}\n'''+callback+'''\nint main(void) {\n unsigned char input[65536],buffer[65536];memset(input,'x',sizeof(input));StringInfoData s={0,buffer};int checks=0;\n #define CHECK(x) do {if(!(x))return 2;checks++;}while(0)\n CHECK(http_writeback(input,1,65536,&s)==65536 && s.len==65536 && append_calls==1);\n CHECK(http_writeback(input,1,1,&s)==0 && s.len==65536 && append_calls==1);\n s.len=0;append_calls=0;CHECK(http_writeback(input,1,65537,&s)==0 && s.len==0 && append_calls==0);\n CHECK(http_writeback(input,SIZE_MAX,2,&s)==0 && append_calls==0);\n CHECK(http_writeback(input,2,SIZE_MAX,&s)==0 && append_calls==0);\n CHECK(http_writeback(input,65537,1,&s)==0 && append_calls==0);\n CHECK(http_writeback(input,0,SIZE_MAX,&s)==0 && s.len==0);\n append_calls=0;s.len=-1;CHECK(http_writeback(input,1,1,&s)==0 && append_calls==0);\n s.len=65537;CHECK(http_writeback(input,1,1,&s)==0 && append_calls==0);\n s.len=65535;CHECK(http_writeback(input,1,1,&s)==1 && s.len==65536 && append_calls==1);\n printf("{\\"checksPassed\\":%d}\\n",checks);return 0;\n}\n'''
assert (root/'tests/response_component.c').read_text()==source
with tempfile.TemporaryDirectory(prefix='mip-response-component-',dir='/tmp') as d:
 target=Path(d)/'http.c';target.write_bytes(old)
 p=subprocess.run(['/usr/bin/patch','--silent','-p1','-i',str(root/'src/pgsql-http-bounded-response.patch')],cwd=d,capture_output=True)
 assert p.returncode==0 and target.read_bytes()==new
 exe=Path(d)/'response-component';flags=['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-fno-omit-frame-pointer','-O1']
 p=subprocess.run(['/usr/bin/gcc',*flags,str(root/'tests/response_component.c'),'-o',str(exe)],capture_output=True)
 assert p.returncode==0,p.stderr.decode()
 p=subprocess.run([str(exe)],capture_output=True);assert p.returncode==0,p.stderr.decode()
 assert json.loads(p.stdout)['checksPassed']==10
receipt={'scope':'host-native-exact-callback-component-with-PostgreSQL-append-adapter','checksPassed':10,'sanitizers':['address','undefined'],'exactCallbackSha256':hashlib.sha256(callback.encode()).hexdigest(),'forkSha256':hashlib.sha256(new).hexdigest(),'patchSha256':hashlib.sha256(patch.encode()).hexdigest(),'componentSourceSha256':hashlib.sha256(source.encode()).hexdigest(),'patchAppliesExactly':True,'bufferCapBytes':65536,'headerAndBodyBuffersSeparate':True,'nativeExtensionExecuted':False,'httpExecuted':False,'databaseExecuted':False,'qualifiedReplacement':False,'oldUnboundedCodeExecuted':False,'cases':['at-cap accepted','cumulative over-cap refused','single oversized refused','multiplication overflow candidates refused before multiplication','zero-size chunk','invalid prior lengths','remaining-byte boundary']}
(out/'bounded-response-component-results.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
