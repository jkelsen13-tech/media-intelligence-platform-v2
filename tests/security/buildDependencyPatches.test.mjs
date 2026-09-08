import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import postcss from 'postcss';

test('build PostCSS refuses implicit out-of-scope maps and retains valid adjacent maps', t => {
  const root=mkdtempSync(join(tmpdir(),'mip-postcss-boundary-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const cssDir=join(root,'css'); mkdirSync(cssDir);
  const marker='MIP_SYNTHETIC_OUTSIDE_MAP';
  const sourceMap=content=>JSON.stringify({version:3,sources:['original.css'],sourcesContent:[content],names:[],mappings:'AAAA'});
  const outside=join(root,'outside.map'); writeFileSync(outside,sourceMap(marker));
  writeFileSync(join(cssDir,'allowed.map'),sourceMap('a { color: red }'));
  const read=(annotation,opts={})=>postcss.parse('a { color: red }\n/*# sourceMappingURL='+annotation+' */',opts).source.input.map;
  assert.equal(read(outside),undefined,'absent from must not authorize an absolute map');
  assert.equal(read('../outside.map',{from:join(cssDir,'entry.css')}),undefined,'parent traversal must not load a map');
  const allowed=read('allowed.map',{from:join(cssDir,'entry.css')});
  assert.ok(allowed,'ordinary adjacent map still loads');
  assert.doesNotMatch(allowed.text,new RegExp(marker));
  // CI is Linux. Symlink creation may require extra privileges on Windows.
  if(process.platform!=='win32'){
    symlinkSync(outside,join(cssDir,'escape.map'));
    assert.equal(read('escape.map',{from:join(cssDir,'entry.css')}),undefined,'in-directory symlink must not escape the CSS directory');
  }
});

test('build Nano ID zero and negative size cases terminate in both module entry points', () => {
  // A bounded subprocess makes an infinite-loop regression fail instead of hanging CI.
  const program = `
    import assert from 'node:assert/strict';
    import {createRequire} from 'node:module';
    const require=createRequire(import.meta.url);
    const variants=[
      [await import('nanoid'),await import('nanoid/non-secure')],
      [require('nanoid'),require('nanoid/non-secure')]
    ];
    for(const [secure,nonsecure] of variants){
      assert.equal(secure.customAlphabet('abc',0)(),'');
      assert.equal(secure.customAlphabet('abc',8)(0),'');
      assert.equal(secure.customRandom('abc',0,n=>new Uint8Array(n))(),'');
      assert.equal(nonsecure.nanoid(-1),'');
      assert.equal(nonsecure.customAlphabet('abc',-1)(),'');
      assert.equal(nonsecure.customAlphabet('abc',8)(-1),'');
      assert.match(secure.customAlphabet('abc',8)(),/^[abc]{8}$/);
      assert.match(nonsecure.customAlphabet('abc',8)(),/^[abc]{8}$/);
    }
    console.log('bounded-generator-cases-passed');
  `;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:5000}).trim(),'bounded-generator-cases-passed');
});
