
/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any unauthenticated user can "create", "read", "update", 
and "delete" any "Todo" records.
=========================================================================*/
import { a, defineData } from '@aws-amplify/backend';
import { auth } from '../auth/resource.js';

export const data = defineData({
  schema: a.schema({
    User: a.model({
        id: a.string().required(),  // Cognito sub
        name: a.string().required(),
        role: a.enum(['Employee', 'Manager', 'Admin']),
        rate: a.float().required(),  // Hourly rate per user
      })
      .authorization((allow) => [
        allow.owner('id').to(['read', 'update']),  // Self-update
        allow.authenticated().to(['read']),
      ]),
    Account: a.model({
        accountNumber: a.string().required(),
        name: a.string().required(),
        details: a.string(),
        balance: a.float().required(),
        startingBalance: a.float().required(),
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
    Transaction: a.model({
        accountId: a.id().required(),
        fromAccountId: a.id(),
        fromName: a.string(),
        amount: a.float().required(),
        debit: a.boolean().required(),
        date: a.string().required(),
        description: a.string().required(),
        runningBalance: a.float().required(),
        account: a.belongsTo('Account', 'accountId'),
      })
      .authorization((allow) => [
        allow.authenticated().to(['read', 'create', 'update', 'delete']),
      ]),
    Timesheet: a.model({
        status: a.enum(['draft', 'submitted', 'approved', 'rejected']),
        totalHours: a.float().required(),
        totalCost: a.float(),
        owner: a.string().required(),
        rejectionReason: a.string(),
        entries: a.hasMany('TimesheetEntry', 'timesheetId'),
      })
      .authorization((allow) => [
        allow.owner().to(['read', 'update', 'delete']),
        allow.authenticated().to(['read']),
      ]),
    TimesheetEntry: a.model({
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
        allow.owner().to(['read', 'update', 'delete']),
      ]),
  }),
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
