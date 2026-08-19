# Local Geographic Graph Preview Note — 2026-08-19

The Vite development route loaded successfully at `http://localhost:5173/media-intelligence-platform-v2/`, but its environment did not contain the isolated-v2 Supabase credentials. The application therefore followed its established safe fallback path and displayed `data: demo` with no live articles or graph records.

This confirms that the local process did not silently point at any production database. Visual validation of the source-backed Geography mode must be performed on the deployed v2 GitHub Pages build, where the existing isolated-v2 deployment configuration is available.
