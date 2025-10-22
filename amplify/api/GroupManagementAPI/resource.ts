import { defineFunction } from '@aws-amplify/backend';

export const GroupManagementAPI = defineFunction({
  name: 'GroupManagementLambda',
  entry: './src/index.ts',
  runtime: 20, // Node.js 20
});
