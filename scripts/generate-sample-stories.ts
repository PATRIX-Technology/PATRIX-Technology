// Thin bootstrap: loads .env.local BEFORE importing the real
// implementation. See generate-sample-stories-impl.ts's header comment
// for why this split exists (module-hoisting silently defeats
// FEATURE_REAL_IMAGE_PROVIDER otherwise).
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

void import('./generate-sample-stories-impl');
