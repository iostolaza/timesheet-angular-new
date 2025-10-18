/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any unauthenticated user can "create", "read", "update", 
and "delete" any "Todo" records.
=========================================================================*/

import { a, defineData } from '@aws-amplify/backend';
import { auth } from '../auth/resource.js';

const schema = a.schema({
  User: a
    .model({
      id: a.string().required(),  // Cognito sub
      name: a.string().required(),
      role: a.enum(['Employee', 'Manager', 'Admin']),
      rate: a.float().required(),  // Hourly rate per user
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('id').to(['read', 'update']),  // Custom owner on 'id' field (matches Cognito sub)
      allow.authenticated().to(['read']),
    ]),
  Account: a
    .model({
      accountNumber: a.string().required(),
      name: a.string().required(),
      details: a.string(),
      balance: a.float().required(),
      startingBalance: a.float(),  // Optional (no .required())
      endingBalance: a.float(),
      date: a.string().required(),
      type: a.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
      rate: a.float().required(),  // Fallback if user rate not used
      chargeCodes: a.string().array(),
      transactions: a.hasMany('Transaction', 'accountId'),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.groups(['Admin']).to(['create', 'update', 'delete']),
    ]),
  Transaction: a
    .model({
      accountId: a.id().required(),
      fromAccountId: a.id(),  // Single, no duplicate
      fromName: a.string(),
      amount: a.float().required(),  // Fixed: removed invalid 'multiple:'
      debit: a.boolean().required(),
      date: a.string().required(),
      description: a.string().required(),
      runningBalance: a.float().required(),
      account: a.belongsTo('Account', 'accountId'),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read', 'create', 'update', 'delete']),
    ]),
  Timesheet: a
    .model({
      status: a.enum(['draft', 'submitted', 'approved', 'rejected']),
      totalHours: a.float().required(),
      totalCost: a.float(),
      owner: a.string().required(),
      rejectionReason: a.string(),
      entries: a.hasMany('TimesheetEntry', 'timesheetId'),
    })
    .authorization((allow) => [
      allow.owner().to(['read', 'update', 'delete']),  // Standard 'owner' field
      allow.authenticated().to(['read']),
    ]),
  TimesheetEntry: a
    .model({
      timesheetId: a.id().required(),
      date: a.string().required(),
      startTime: a.string().required(),
      endTime: a.string().required(),
      hours: a.float().required(),
      description: a.string().required(),
      chargeCode: a.string().required(),
      owner: a.string().required(),
      timesheet: a.belongsTo('Timesheet', 'timesheetId'),
    })
    .authorization((allow) => [
      allow.owner().to(['read', 'update', 'delete']),  // Standard 'owner' field
    ]),
});

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

// Explicit export for frontend typing (resolves import/index signature issues)
export type Schema = typeof schema;

/*== STEP 2 & 3 snippets unchanged ==*/