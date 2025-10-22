// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { CognitoCrudlStack } from './function/CognitoCrudlStack';

const cognitoCrudl = new CognitoCrudlStack();

defineBackend({
  auth,
  data,
  CognitoCrudlStack: cognitoCrudl, // ✅ Pass instance, not class
});
