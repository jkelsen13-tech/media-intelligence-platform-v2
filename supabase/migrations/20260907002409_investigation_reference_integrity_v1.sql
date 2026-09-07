-- Reject repeated references within each hypothesis or stage.
-- Preserve retained history, selected scope, source bindings, and existing function grants.
begin;
create or replace function evidence_pipeline.workspace_validate_state(p jsonb,snapshot jsonb) returns void
language plpgsql stable security invoker set search_path='' as $$
declare o jsonb; s jsonb; v jsonb; ids uuid[]; reference_ids uuid[]; stage_ids uuid[]; coverage_ids uuid[]:='{}'; id uuid; target uuid; from_at timestamptz; to_at timestamptz;
begin
  perform evidence_pipeline.workspace_keys(p,array['question','scope_note','canonical_subject','time_range','unresolved_questions','hypotheses','commitments','coverage']);
  if octet_length(p::text)>131072 then raise exception using errcode='22023',message='workspace state exceeds 128 KiB'; end if;
  perform evidence_pipeline.workspace_text(p->'question',1000); perform evidence_pipeline.workspace_text(p->'scope_note',4000);
  perform evidence_pipeline.workspace_texts(p->'unresolved_questions',30);
  perform evidence_pipeline.workspace_keys(p->'time_range',array['from','to','meaning']);
  from_at:=evidence_pipeline.workspace_nullable_time(p->'time_range'->'from');
  to_at:=evidence_pipeline.workspace_nullable_time(p->'time_range'->'to');
  if from_at>to_at then raise exception using errcode='22023',message='reversed time range'; end if;
  perform evidence_pipeline.workspace_text(p->'time_range'->'meaning');
  if p->'canonical_subject'<>'null'::jsonb then
    perform evidence_pipeline.workspace_keys(p->'canonical_subject',array['type','id']);
    target:=evidence_pipeline.workspace_uuid(p->'canonical_subject'->'id');
    perform evidence_pipeline.workspace_choice(p->'canonical_subject'->'type',array['graph_node']);
    if p->'canonical_subject'->>'type'<>'graph_node' or not exists(
      select 1 from jsonb_array_elements(snapshot->'candidates') c where c->>'event_node_id'=target::text or c->>'related_node_id'=target::text) then
      raise exception using errcode='22023',message='canonical subject is not a retained graph identity'; end if;
  end if;
  perform evidence_pipeline.workspace_array(p->'coverage',20);
  for o in select value from jsonb_array_elements(p->'coverage') loop
    perform evidence_pipeline.workspace_keys(o,array['id','label','status','source_classes','languages','regions','from','to','retained_text','search_status','searched_at','method','limitations']);
    id:=evidence_pipeline.workspace_uuid(o->'id');
    if id=any(coverage_ids) then raise exception using errcode='22023',message='duplicate coverage identity'; end if;
    coverage_ids:=array_append(coverage_ids,id);
    perform evidence_pipeline.workspace_text(o->'label'); perform evidence_pipeline.workspace_text(o->'method');
    perform evidence_pipeline.workspace_texts(o->'source_classes');perform evidence_pipeline.workspace_texts(o->'languages');
    perform evidence_pipeline.workspace_texts(o->'regions');perform evidence_pipeline.workspace_texts(o->'limitations');
    perform evidence_pipeline.workspace_choice(o->'status',array['not_assessed','limited','documented_scope']);
    perform evidence_pipeline.workspace_choice(o->'retained_text',array['full_text','summary_only','mixed','unknown']);
    perform evidence_pipeline.workspace_choice(o->'search_status',array['not_run','partial','completed_for_declared_scope']);
    if o->>'status' not in ('not_assessed','limited','documented_scope') or o->>'retained_text' not in ('full_text','summary_only','mixed','unknown')
      or o->>'search_status' not in ('not_run','partial','completed_for_declared_scope') then
      raise exception using errcode='22023',message='invalid coverage state'; end if;
    from_at:=evidence_pipeline.workspace_nullable_time(o->'from');to_at:=evidence_pipeline.workspace_nullable_time(o->'to');
    if from_at>to_at then raise exception using errcode='22023',message='reversed coverage time range'; end if;
    perform evidence_pipeline.workspace_nullable_time(o->'searched_at');
    if o->>'search_status'<>'not_run' and (o->'searched_at'='null'::jsonb or jsonb_array_length(o->'source_classes')=0
      or jsonb_array_length(o->'limitations')=0) then
      raise exception using errcode='22023',message='search claims require declared sources, time and limitations'; end if;
  end loop;
  perform evidence_pipeline.workspace_array(p->'hypotheses',20); ids:='{}';
  for o in select value from jsonb_array_elements(p->'hypotheses') loop
    perform evidence_pipeline.workspace_keys(o,array['id','statement','assessment_ids','evidence','assumptions','would_strengthen','would_weaken','remaining_uncertainty']);
    id:=evidence_pipeline.workspace_uuid(o->'id');
    if id=any(ids) then raise exception using errcode='22023',message='duplicate hypothesis identity'; end if; ids:=array_append(ids,id);
    perform evidence_pipeline.workspace_text(o->'statement',4000);perform evidence_pipeline.workspace_text(o->'remaining_uncertainty',4000);
    perform evidence_pipeline.workspace_texts(o->'assumptions');perform evidence_pipeline.workspace_texts(o->'would_strengthen');perform evidence_pipeline.workspace_texts(o->'would_weaken');
    if jsonb_array_length(o->'would_strengthen')=0 or jsonb_array_length(o->'would_weaken')=0 then
      raise exception using errcode='22023',message='hypothesis requires discriminating evidence criteria'; end if;
    perform evidence_pipeline.workspace_array(o->'assessment_ids',32);
    reference_ids:='{}';
    for v in select value from jsonb_array_elements(o->'assessment_ids') loop
      target:=evidence_pipeline.workspace_uuid(v);
      if target=any(reference_ids) then raise exception using errcode='22023',message='duplicate hypothesis assessment reference'; end if;
      reference_ids:=array_append(reference_ids,target);
      if not snapshot->'selected_assessment_ids' ? target::text then raise exception using errcode='22023',message='assessment outside selected scope'; end if;
    end loop;
    perform evidence_pipeline.workspace_evidence(o->'evidence',snapshot);
  end loop;
  perform evidence_pipeline.workspace_array(p->'commitments',20);ids:='{}';
  for o in select value from jsonb_array_elements(p->'commitments') loop
    perform evidence_pipeline.workspace_keys(o,array['id','actor','statement','scope','conditions','deadline_text','success_criterion','remaining_uncertainty','stages']);
    id:=evidence_pipeline.workspace_uuid(o->'id');
    if id=any(ids) then raise exception using errcode='22023',message='duplicate commitment identity'; end if;ids:=array_append(ids,id);
    perform evidence_pipeline.workspace_text(o->'actor');perform evidence_pipeline.workspace_text(o->'statement',4000);
    perform evidence_pipeline.workspace_text(o->'scope');perform evidence_pipeline.workspace_texts(o->'conditions');
    perform evidence_pipeline.workspace_text(o->'deadline_text');perform evidence_pipeline.workspace_text(o->'success_criterion');
    perform evidence_pipeline.workspace_text(o->'remaining_uncertainty',4000);
    perform evidence_pipeline.workspace_array(o->'stages',30);stage_ids:='{}';
    for s in select value from jsonb_array_elements(o->'stages') loop
      perform evidence_pipeline.workspace_keys(s,array['id','kind','status','depends_on','coverage_ids','evidence','note']);
      id:=evidence_pipeline.workspace_uuid(s->'id');
      if id=any(stage_ids) then raise exception using errcode='22023',message='duplicate commitment stage'; end if;
      perform evidence_pipeline.workspace_choice(s->'kind',array['commitment','prerequisite','action','implementation','outcome']);
      perform evidence_pipeline.workspace_choice(s->'status',array['unknown','reported','observed','no_followup_found','not_applicable','cancelled']);
      if s->>'kind' not in ('commitment','prerequisite','action','implementation','outcome')
        or s->>'status' not in ('unknown','reported','observed','no_followup_found','not_applicable','cancelled') then
        raise exception using errcode='22023',message='invalid commitment stage'; end if;
      perform evidence_pipeline.workspace_text(s->'note');perform evidence_pipeline.workspace_array(s->'depends_on',30);
      reference_ids:='{}';
      for v in select value from jsonb_array_elements(s->'depends_on') loop
        target:=evidence_pipeline.workspace_uuid(v);
        if target=any(reference_ids) then raise exception using errcode='22023',message='duplicate stage dependency reference'; end if;
        reference_ids:=array_append(reference_ids,target);
        if not evidence_pipeline.workspace_uuid(v)=any(stage_ids) then
          raise exception using errcode='22023',message='stage dependencies must precede stage; cycles and missing stages rejected'; end if;
      end loop;
      stage_ids:=array_append(stage_ids,id);
      perform evidence_pipeline.workspace_array(s->'coverage_ids',20);
      reference_ids:='{}';
      for v in select value from jsonb_array_elements(s->'coverage_ids') loop
        target:=evidence_pipeline.workspace_uuid(v);
        if target=any(reference_ids) then raise exception using errcode='22023',message='duplicate stage coverage reference'; end if;
        reference_ids:=array_append(reference_ids,target);
        if not evidence_pipeline.workspace_uuid(v)=any(coverage_ids) then raise exception using errcode='22023',message='unknown coverage reference'; end if;
      end loop;
      perform evidence_pipeline.workspace_evidence(s->'evidence',snapshot);
      if s->>'status' in ('reported','observed','cancelled') and jsonb_array_length(s->'evidence')=0 then
        raise exception using errcode='22023',message='stage status requires retained evidence'; end if;
      if s->>'status'='no_followup_found' and not exists(select 1 from jsonb_array_elements(p->'coverage') c
        where s->'coverage_ids' ? (c->>'id') and c->>'search_status'='completed_for_declared_scope') then
        raise exception using errcode='22023',message='no-followup observation requires completed bounded search'; end if;
    end loop;
  end loop;
end $$;

commit;
