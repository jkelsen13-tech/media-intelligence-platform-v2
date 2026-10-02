async function extractBatch(
  supabase: any,
  resolver: EntityResolver,
  outletNames: Set<string>,
  cfg: any,
  report: any,
  runTag: string | null = null,
): Promise<boolean> {
  // Legacy extraction must never rewrite the source currently admitted to
  // ordinary readers. Recheck this predicate in each UPDATE, including races
  // where a selected pending record becomes eligible before its write.
  const nonPublicSource = 'reader_state.neq.eligible,source_status.neq.active'
  const guardedArticleUpdate = (articleId: string, updates: any) => supabase
    .from('articles').update(updates).eq('id', articleId).or(nonPublicSource).select('id')
  const recordSkippedSource = () => {
    report.reviewedSourceSkipped = (report.reviewedSourceSkipped ?? 0) + 1
  }
  // Scoped mode (Doc 07 Item 2b): when runTag is set, selection is narrowed
  // to that ingestion run's rows ONLY — the corpus-wide null markers must
  // never pull legacy articles into a scoped run.
  let q = supabase
    .from('articles')
    .select('id, title, summary, body_text, image_url, image_alt, ingestion_run_id')
    .is('entities_extracted_at', null)
    .or(nonPublicSource)
    .order('fetched_at', { ascending: true })
    .limit(EXTRACT_BATCH)
  if (runTag) q = q.eq('ingestion_run_id', runTag)
  const { data: batch, error } = await q
  if (error) throw error
  if (!batch || batch.length === 0) return false

  const ENT_MIN_CONF = Number(cfg.entity_resolve_min_confidence ?? 0.5)
  const DIGEST_ENTITY_COUNT = Number(cfg.digest_entity_count ?? 8)
  const DOC_WEIGHTS = cfg.doc_strength_weights ?? {}

  for (const art of batch) {
    try {
      const t = sanitize(art.title)
      const s = sanitize(art.summary)
      const b = sanitize(art.body_text)
      const extractedAt = new Date().toISOString()
      const updates: any = {}
      if (t.text !== (art.title ?? '')) updates.title = t.text
      if (s.text !== (art.summary ?? '')) updates.summary = s.text || null
      if (b.text !== (art.body_text ?? '')) updates.body_text = b.text || null
      if (!art.image_url && s.imageUrl) updates.image_url = s.imageUrl
      if (!art.image_alt && s.imageAlt) updates.image_alt = s.imageAlt

      if (isMetadataOnlyReferenceBody(b.text)) {
        // Preserve the article for News and chronological Timeline access, but
        // explicitly withhold every inferred cross-surface relation until an
        // original publisher body is hydrated and can supply literal evidence.
        updates.claims = []
        updates.is_digest = false
        updates.arc_assign_attempted_at = new Date().toISOString()
        updates.source_status_changed_at = new Date().toISOString()
        updates.source_status_note = 'Reference-manifest metadata only; original publisher body is unavailable for literal extraction or cross-surface assignment.'
        const { data: written, error: upErr } = await guardedArticleUpdate(art.id, updates)
        if (upErr) throw upErr
        if (!written?.length) { recordSkippedSource(); continue }
        await supabase.from('citations').delete().eq('article_id', art.id)
        await supabase.from('article_entities').delete().eq('article_id', art.id)
        const { data: completed, error: completedErr } = await guardedArticleUpdate(art.id, { entities_extracted_at: extractedAt })
        if (completedErr) throw completedErr
        if (!completed?.length) { recordSkippedSource(); continue }
        report.metadataOnlySkipped = (report.metadataOnlySkipped ?? 0) + 1
        continue
      }

      const analysisText = `${t.text}. ${b.text || s.text}`
      const claims = extractClaims(analysisText)
      updates.claims = claims

      // A denied or raced source write must not delete public citations or
      // resolve/upsert derived entities. Separate later requests still require
      // an atomic approval boundary before legacy extraction is reactivated.
      const { data: written, error: upErr } = await guardedArticleUpdate(art.id, updates)
      if (upErr) throw upErr
      if (!written?.length) { recordSkippedSource(); continue }
      const resolved = await extractAndResolveEntities(supabase, resolver, art.id, analysisText, outletNames)
      report.entitiesResolved += resolved.length
      const strong = resolved.filter((r) => r.confidence >= ENT_MIN_CONF)
      const orgPersonCount = strong.filter((r) => ['person', 'organization', 'institution'].includes(r.entity_type)).length
      const isDigestArticle = isDigest(t.text, orgPersonCount, DIGEST_ENTITY_COUNT)
      await supabase.from('citations').delete().eq('article_id', art.id)
      for (const c of extractCitations(analysisText, DOC_WEIGHTS)) {
        await supabase.from('citations').insert({ ...c, article_id: art.id })
        report.citations++
      }

      const { data: completed, error: completedErr } = await guardedArticleUpdate(art.id, { is_digest: isDigestArticle, entities_extracted_at: extractedAt })
      if (completedErr) throw completedErr
      if (!completed?.length) { recordSkippedSource(); continue }
      if (isDigestArticle) report.digests++
      report.extracted++
    } catch (err) {
      report.errors.push(`extract ${String(art.id).slice(0, 8)}: ${String(err)}`)
      await guardedArticleUpdate(art.id, { entities_extracted_at: new Date().toISOString() })
    }
  }
  return true
}
