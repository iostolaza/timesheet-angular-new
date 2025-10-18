import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    username: true,
  },
  userAttributes: {
    email: { required: false },
  },
  groups: ['Admin', 'Manager', 'Employee'],
});