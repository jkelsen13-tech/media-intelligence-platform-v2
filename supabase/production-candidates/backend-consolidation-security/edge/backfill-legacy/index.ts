Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, code: "owner_containment" }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  }),
);
