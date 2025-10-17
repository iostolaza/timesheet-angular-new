
/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any unauthenticated user can "create", "read", "update", 
and "delete" any "Todo" records.
=========================================================================*/
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Timesheet: a
    .model({
      id: a.string().required(),
      status: a.enum(['draft', 'submitted', 'approved', 'rejected']),
      entries: a.hasMany('TimesheetEntry', 'timesheetId'),
      totalHours: a.float(),
      totalCost: a.float(),
      owner: a.string(),
      rejectionReason: a.string()
    })
    .authorization(allow => [allow.owner()]),
  TimesheetEntry: a
    .model({
      id: a.string().required(),
      timesheetId: a.string().required(),
      date: a.string().required(),
      startTime: a.string().required(),
      endTime: a.string().required(),
      hours: a.float().required(),
      description: a.string().required(),
      accountId: a.integer().required()
    })
    .authorization(allow => [allow.ownerDefinedIn('timesheetId')]),
  Account: a
    .model({
      id: a.integer().required(),
      account_number: a.string().required(),
      name: a.string().required(),
      details: a.string(),
      balance: a.float().required(),
      starting_balance: a.float().required(),
      ending_balance: a.float(),
      date: a.string().required(),
      type: a.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'])
    })
    .authorization(allow => [allow.owner()]),
  Employee: a
    .model({
      id: a.integer().required(),
      name: a.string().required()
    })
    .authorization(allow => [allow.owner()]),
  ChargeCode: a
    .model({
      id: a.integer().required(),
      account_id: a.integer().required(),
      employee_id: a.integer().required(),
      charge_code: a.string().required()
    })
    .authorization(allow => [allow.owner()]),
  User: a
    .model({
      id: a.integer().required(),
      name: a.string().required(),
      role: a.enum(['Employee', 'Manager', 'Admin'])
    })
    .authorization(allow => [allow.owner()]),
  Permission: a
    .model({
      id: a.integer().required(),
      user_id: a.integer().required(),
      account_id: a.integer().required(),
      can_view: a.boolean().required()
    })
    .authorization(allow => [allow.owner()]),
  Transaction: a
    .model({
      id: a.integer().required(),
      account_id: a.integer().required(),
      from_account_id: a.integer(),
      from_name: a.string(),
      amount: a.float().required(),
      debit: a.boolean().required(),
      date: a.string().required(),
      description: a.string().required(),
      running_balance: a.float().required()
    })
    .authorization(allow => [allow.owner()])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool'
  }
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
