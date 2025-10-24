// file: amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { CognitoCrudlStack } from './function/CognitoCrudlStack';

// Pass auth to CognitoCrudlStack for dynamic userPoolId access
const cognitoCrudl = new CognitoCrudlStack(auth);

defineBackend({
  auth,
  data,
  CognitoCrudlStack: cognitoCrudl,
});