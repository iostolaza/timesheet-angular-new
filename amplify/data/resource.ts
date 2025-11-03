import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any unauthenticated user can "create", "read", "update", 
and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  User: a
    .model({
      id: a.string().required(),
      email: a.string().required(),
      name: a.string().required(),
      role: a.enum(['Employee', 'Manager', 'Admin']),
      rate: a.float().required(),
      otMultiplier: a.float().default(1.5),
      taxRate: a.float().default(0.015),
    })
    .authorization(allow => [
      allow.owner().to(['read', 'update', 'delete']),
      allow.authenticated().to(['create', 'read']),
    ]),

  Account: a
    .model({
      id: a.id().required(),
      accountNumber: a.string().required(),
      name: a.string().required(),
      details: a.string(),
      balance: a.float().required(),
      startingBalance: a.float(),
      endingBalance: a.float(),
      date: a.string().required(),
      type: a.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
      chargeCodesJson: a.string(),
      transactions: a.hasMany('Transaction', 'accountId'),
    })
    .authorization(allow => [
      allow.authenticated().to(['create', 'read', 'update', 'delete']),
    ]),

  Transaction: a
    .model({
      id: a.id().required(),
      accountId: a.id().required(),
      account: a.belongsTo('Account', 'accountId'),
      fromAccountId: a.string(),
      fromName: a.string(),
      amount: a.float().required(),
      debit: a.boolean().required(),
      date: a.string().required(),
      description: a.string().required(),
      runningBalance: a.float().required(),
    })
    .authorization(allow => [
      allow.authenticated().to(['create', 'read', 'update', 'delete']),
    ]),

  Timesheet: a
    .model({
      id: a.id().required(),
      status: a.enum(['draft', 'submitted', 'approved', 'rejected']),
      totalHours: a.float().required(),
      totalCost: a.float(),
      owner: a.string().required(),
      rejectionReason: a.string(),
      associatedChargeCodesJson: a.string().required(),
      dailyAggregatesJson: a.string(), 
      grossTotal: a.float(),
      taxAmount: a.float(),
      netTotal: a.float(),
      entries: a.hasMany('TimesheetEntry', 'timesheetId'),
    })
    .authorization(allow => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['read', 'update']),
    ]),

  TimesheetEntry: a
    .model({
      id: a.id().required(),
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
    .authorization(allow => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['read']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});


/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
