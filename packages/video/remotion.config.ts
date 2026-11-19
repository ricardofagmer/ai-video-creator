// Applies to the Remotion CLI (studio, render). The Node API in src/render passes
// the same options explicitly, because bundle()/renderMedia() never read this file.
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setPixelFormat('yuv420p');
