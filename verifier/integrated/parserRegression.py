# Entirely synthetic fixtures. No legal-code passages or network access.
import pathlib,runpy,urllib.request
def run(extract):
 def offline(*args,**kwargs):raise RuntimeError('offline_network_forbidden')
 urllib.request.urlopen=offline
 old=runpy.run_path(str(pathlib.Path(__file__).with_name('legacySelectionParser.py')))['extract']
 title='<title>Attribution 4.0 International</title>'
 h1='<h3>Section 1 – Definitions.</h3>'
 h2='<h3>Section 2 – Scope.</h3>'
 items=''.join('<li>Synthetic definition '+str(i)+(' referring to Section 2(b)(1)-(2)' if i==2 else '')+'</li>' for i in range(1,12))
 body='<ol>'+items+'</ol>'
 sample=title+'<main>'+h1+body+h2+'<p>outside-sentinel</p></main>'
 cases=[]
 def good(name,html,required=None):
  text,meta=extract(html)
  if 'outside-sentinel' in text or 'toc-sentinel' in text or meta['definition_count']!=11:raise RuntimeError('synthetic_extraction_failure')
  if required and required not in text:raise RuntimeError('synthetic_extraction_failure')
  cases.append({'case':name,'result':'pass','synthetic':True})
 def bad(name,html,expected):
  try:extract(html)
  except RuntimeError as e:
   if str(e)!=expected:raise RuntimeError('synthetic_case_'+name+'_expected_'+expected+'_got_'+str(e))
  else:raise RuntimeError('synthetic_case_'+name+'_unexpected_allow')
  cases.append({'case':name,'result':'pass','synthetic':True})
 try:old(sample)
 except RuntimeError as e:
  if str(e)!='selection_section_marker_detected':raise RuntimeError('legacy_reproduction_failed')
  legacy_error=str(e)
 else:raise RuntimeError('legacy_reproduction_failed')
 # The pre-granular frozen capture used the identical predicate with
 # selection_discrepancy; the accepted checkpoint renamed only its diagnostic.
 good('cross_reference',sample,'Section 2(b)(1)-(2)')
 good('actual_heading_terminates',sample)
 good('later_references',sample.replace('referring to Section 2(b)(1)-(2)','referring to Section 8 and Section 2(b)(1)-(2)'),'Section 8')
 good('literal_url_in_definition',sample.replace('Synthetic definition 1<','Synthetic definition 1 https://example.invalid/reference<'),'https://example.invalid/reference')
 good('at_character_in_definition',sample.replace('Synthetic definition 1<','Synthetic definition 1 operator @ token<'),'operator @ token')
 good('nav_toc_before_body',title+'<nav>'+h1+'<a href="#s2">Section 2 toc-sentinel</a>'+h2+'</nav><main>'+h1+body+h2+'<p>outside-sentinel</p></main>')
 good('toc_container_before_body',title+'<div class="table-of-contents">'+h1+h2+'toc-sentinel</div><main>'+h1+body+h2+'</main>')
 good('section_wrappers',title+'<article><section>'+h1+body+'</section><section>'+h2+'<p>outside-sentinel</p></section></article>')
 good('outside_contact_not_retained',sample+'<address>outside-sentinel@example.invalid</address>')
 bad('missing_start',sample.replace(h1,''),'selection_missing_section_1')
 bad('missing_end',sample.replace(h2,''),'selection_missing_section_2')
 bad('duplicate_start',sample.replace(h1,h1+h1),'selection_duplicate_heading')
 bad('duplicate_end',sample.replace(h2,h2+h2),'selection_duplicate_heading')
 bad('malformed_start',sample.replace('Definitions.','Definitions unexpected'),'selection_malformed_heading')
 bad('malformed_end',sample.replace('Scope.','Scope unexpected'),'selection_malformed_heading')
 bad('heading_level',sample.replace(h2,h2.replace('h3','h2')),'selection_heading_level_mismatch')
 bad('reversed_bounds',title+h2+h1+body,'selection_boundary_order')
 bad('unexpected_subheading',sample.replace('<ol>','<h4>Foreign heading</h4><ol>'),'selection_unexpected_heading')
 bad('missing_list',sample.replace('<ol>','<div>').replace('</ol>','</div>'),'selection_definition_structure')
 bad('wrong_definition_count',sample.replace('<li>Synthetic definition 11</li>',''),'selection_definition_count')
 bad('navigation_inside_range',sample.replace('<ol>','<nav>foreign</nav><ol>'),'selection_forbidden_element')
 bad('contact_block_inside_range',sample.replace('<ol>','<address>synthetic@example.invalid</address><ol>'),'selection_forbidden_element')
 bad('image_inside_range',sample.replace('<ol>','<img src="synthetic"><ol>'),'selection_forbidden_element')
 bad('unexpected_text',sample.replace('<ol>','<p>unscoped text</p><ol>'),'selection_unexpected_text')
 bad('malformed_markup',sample.replace('<li>Synthetic definition 1</li>','<li><em>Synthetic definition 1</li>'),'selection_malformed_structure')
 bad('unexpected_table',sample.replace('<ol>','<table></table><ol>'),'selection_forbidden_element')
 bad('wrong_material_title',sample.replace('Attribution 4.0 International','Different material'),'material_title_mismatch')
 return {'synthetic_parser_tests':len(cases),'pass':len(cases),'legacy_reproduced':True,'legacy_error':legacy_error,'original_equivalent_error':'selection_discrepancy','network_requests':0,'cases':cases}
