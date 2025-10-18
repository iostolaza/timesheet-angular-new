import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,  // Enables username/email login; Cognito uses email as username
  },
  userAttributes: {
    email: { required: false },
  },
  groups: ['Admin', 'Manager', 'Employee'],
});