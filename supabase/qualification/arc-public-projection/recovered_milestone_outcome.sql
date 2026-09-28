CREATE OR REPLACE FUNCTION public.mip_arc_projection_milestone_outcome(p_milestone_key text, p_article_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  case p_milestone_key
    when 'ia_concludes' then
      if p_article_text ~* '(investigat|inquiry|probe).{0,60}(dropped|abandoned|closed without|shelved)' then return 'failed'; end if;
      if p_article_text ~* '(findings?|report).{0,40}(published|released)|(investigat|inquiry|probe|inquest).{0,80}(conclud|complet|publishes|releases)' then return 'confirmed'; end if;
    when 'ia_charges' then
      if p_article_text ~* '(cleared|no charges|charges dropped|acquit|exonerat)' then return 'failed'; end if;
      if p_article_text ~* '(charged|charges (filed|brought)|indict|prosecut|disciplin|suspended|dismissed|sacked)' then return 'confirmed'; end if;
    when 'ia_policy' then
      if p_article_text ~* '(policy change|reform|new (rules|guidelines|protocols)|overhaul|code of conduct)' then return 'confirmed'; end if;
    when 'ia_remedy' then
      if p_article_text ~* '(settlement|compensation|payout|remedy|apolog|damages awarded|redress)' then return 'confirmed'; end if;
    when 'gp_ceasefire' then
      if p_article_text ~* '(talks? (collapse|fail)|ceasefire (broken|collapses|ends))' then return 'failed'; end if;
      if p_article_text ~* '(ceasefire|truce|de-escalat|peace (deal|agreement)|armistice|withdraw)' then return 'confirmed'; end if;
    when 'gp_sanctions' then
      if p_article_text ~* '(sanctions? (imposed|announced|extended)|retaliat|expel|travel ban)' then return 'confirmed'; end if;
    when 'gp_routes' then
      if p_article_text ~* '(resum|reopen|normali|returns? to (the )?(red sea|route|port))' then return 'confirmed'; end if;
    when 'gp_escalation' then
      if p_article_text ~* '(escalat|strike|attack|intervention|deploy|mobilis|mobiliz)' then return 'confirmed'; end if;
    when 'ep_enacted' then
      if p_article_text ~* '(takes effect|comes into force|enacted|implement|signed into law|approved)' then return 'confirmed'; end if;
    when 'ep_market' then
      if p_article_text ~* '(markets? (react|fall|rise|slide)|shares? (fell|fall|rose|rise)|prices? (rise|fall|rose|fell)|adjust)' then return 'confirmed'; end if;
    when 'ep_reversal' then
      if p_article_text ~* '(revers|withdraw|scrapped|backs off|abandon|u-turn)' then return 'confirmed'; end if;
    when 'ep_funding', 'lr_funding' then
      if p_article_text ~* '(funding|allocat|budget|appropriat|bailout)' then return 'confirmed'; end if;
    when 'lr_enforcement' then
      if p_article_text ~* '(enforcement|fined|fine|penalt|crackdown|sanctioned)' then return 'confirmed'; end if;
    when 'lr_challenge' then
      if p_article_text ~* '(lawsuit|legal challenge|judicial review|court challenge|appeal|injunction)' then return 'confirmed'; end if;
    when 'lr_deadline' then
      if p_article_text ~* '(delayed|postponed|missed deadline|pushed back)' then return 'failed'; end if;
      if p_article_text ~* '(takes effect|comes into force|deadline|implement|in force)' then return 'confirmed'; end if;
    when 'gen_response' then
      if p_article_text ~* '(respond|statement|comment|reaction)' then return 'confirmed'; end if;
    when 'gen_development' then
      if p_article_text ~* '(develop|update|continu|latest)' then return 'confirmed'; end if;
    when 'gen_reaction' then
      if p_article_text ~* '(react|criticis|criticiz|praise|backlash|condemn)' then return 'confirmed'; end if;
  end case;
  return null;
end;
$function$
