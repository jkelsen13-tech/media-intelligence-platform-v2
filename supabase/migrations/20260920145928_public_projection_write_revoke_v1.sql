revoke insert, update, delete, truncate, references, trigger, maintain
on table
  public.spatial_projection_v1,
  public.authors_public,
  public.arc_milestones_public,
  public.comparison_public,
  public.graph_coverage_public,
  public.news_detail_public,
  public.investigation_surface_public
from public, anon, authenticated;
