# Video Studio

A local studio that turns recipes and catalog assets into finished videos through staged runs, and publishes them to connected platforms.

## Language

### HyperFrames engine

**Render runtime**:
The complete set of resolved paths, programs and ports a HyperFrames process is started with.
_Avoid_: Render config, environment, settings

**Render runtime gate**:
The single decision of whether a HyperFrames render may start, answered as a render runtime or one refusal reason.
_Avoid_: Pre-start checks, preflight, readiness check

**Refusal reason**:
The one named cause for which the render runtime gate declines to start a render.
_Avoid_: Error code, failure kind

**Trace**:
The owner-run network observation of a sandboxed render that gates the engine being enabled.
_Avoid_: Network test, dry run
