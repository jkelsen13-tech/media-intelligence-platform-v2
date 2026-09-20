// Repository-only shim. The deployment manifest substitutes the exact
// registered v6 handler bytes at this path so the adapter and base implementation
// are self-contained in the deployed package.
export * from "../../runtime-snapshots/spatial-runtime-v6/handler.ts";
