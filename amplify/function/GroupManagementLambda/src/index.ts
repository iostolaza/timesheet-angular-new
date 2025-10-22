import {
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  DeleteGroupCommand,
  ListGroupsCommand,
  GetGroupCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  ListUsersInGroupCommand,
  UpdateGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export const handler = async (event: any) => {
  const client = new CognitoIdentityProviderClient({ region: 'us-west-1' });
  const { httpMethod, path, body, queryStringParameters } = event;
  const userPoolId = queryStringParameters?.UserPoolId || 'us-west-1_KfNSgZaRI';

  try {
    if (httpMethod === 'POST' && path === '/groups') {
      const { GroupName } = JSON.parse(body);
      const command = new CreateGroupCommand({ UserPoolId: userPoolId, GroupName });
      await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ message: `Group ${GroupName} created` }) };
    }

    if (httpMethod === 'GET' && path.match(/\/groups\/[^\/]+$/)) {
      const groupName = path.split('/').pop();
      const command = new GetGroupCommand({ UserPoolId: userPoolId, GroupName: groupName });
      const response = await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ Group: response.Group }) };
    }

    if (httpMethod === 'PUT' && path.match(/\/groups\/[^\/]+$/)) {
      const groupName = path.split('/').pop();
      const { Description } = JSON.parse(body);
      const command = new UpdateGroupCommand({ UserPoolId: userPoolId, GroupName: groupName, Description });
      await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ message: `Group ${groupName} updated` }) };
    }

    if (httpMethod === 'DELETE' && path.match(/\/groups\/[^\/]+$/)) {
      const groupName = path.split('/').pop();
      const command = new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: groupName });
      await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ message: `Group ${groupName} deleted` }) };
    }

    if (httpMethod === 'GET' && path === '/groups') {
      const command = new ListGroupsCommand({ UserPoolId: userPoolId, Limit: queryStringParameters?.Limit || 60 });
      const response = await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ Groups: response.Groups }) };
    }

    if (httpMethod === 'POST' && path.match(/\/groups\/[^\/]+\/users$/)) {
      const groupName = path.split('/')[2];
      const { Username } = JSON.parse(body);
      const command = new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username, GroupName: groupName });
      await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ message: `User ${Username} added to group ${groupName}` }) };
    }

    if (httpMethod === 'DELETE' && path.match(/\/groups\/[^\/]+\/users\/[^\/]+$/)) {
      const groupName = path.split('/')[2];
      const username = path.split('/')[4];
      const command = new AdminRemoveUserFromGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: groupName });
      await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ message: `User ${username} removed from group ${groupName}` }) };
    }

    if (httpMethod === 'GET' && path.match(/\/groups\/[^\/]+\/users$/)) {
      const groupName = path.split('/')[2];
      const command = new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: groupName, Limit: queryStringParameters?.Limit || 60 });
      const response = await client.send(command);
      return { statusCode: 200, body: JSON.stringify({ Users: response.Users }) };
    }

    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
  } catch (error: any) {
    console.error('Lambda error:', error);
    return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Internal server error' }) };
  }
};
