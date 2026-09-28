// Source-only packaging candidate for the existing qik project.
// No runtime activation is authorized by committing this entrypoint.
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {createNativeComparisonEdge} from './adapter.mjs';
const globals=globalThis as unknown as {Buffer:typeof Buffer;process:typeof process};
globals.Buffer??=Buffer;
globals.process??=process;
// Keep the canonical Node host and its dependency graph unchanged. Globals are
// available before the host evaluates; no credentials or requests are logged.
const handler=await createNativeComparisonEdge({
 readSecret:(name:string)=>Deno.env.get(name),
 loadCaller:()=>import('../../qualification/native-comparison-caller/host.mjs'),
});
export default {fetch:handler};
