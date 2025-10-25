import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../../../../amplify_outputs.json';
import {
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  ListGroupsCommand,
  AdminAddUserToGroupCommand,
  ListUsersInGroupCommand,
  AdminRemoveUserFromGroupCommand,
  DeleteGroupCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

@Injectable({ providedIn: 'root' })
export class CognitoGroupService {
  private userPoolId: string = outputs.auth?.user_pool_id ?? 'us-west-1_KfNSgZaRI';
  private apiEndpoint: string | undefined = outputs.data?.api?.CognitoGroupAPI?.endpoint;
  private cognitoClient: CognitoIdentityProviderClient | undefined;

  constructor() {
    Amplify.configure(outputs);
    // Initialize Cognito client asynchronously
    this.initializeCognitoClient();
  }

  private async initializeCognitoClient() {
    try {
      const session = await fetchAuthSession();
      const credentials = session.credentials;
      if (!credentials) {
        throw new Error('No credentials available');
      }
      this.cognitoClient = new CognitoIdentityProviderClient({
        region: outputs.auth?.aws_region || 'us-west-1',
        credentials: credentials,
      });
    } catch (err) {
      console.error('Failed to initialize Cognito client:', err);
      throw err;
    }
  }

  private async ensureCognitoClient() {
    if (!this.cognitoClient) {
      await this.initializeCognitoClient();
    }
    if (!this.cognitoClient) {
      throw new Error('Cognito client not initialized');
    }
    return this.cognitoClient;
  }

  private async getAuthHeaders(): Promise<{ Authorization: string }> {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) {
      throw new Error('No ID token available');
    }
    return { Authorization: idToken };
  }

  async debugCredentials() {
    try {
      const session = await fetchAuthSession();
      const creds = session.credentials;
      console.log('Credentials:', JSON.stringify(creds, null, 2));
      return creds;
    } catch (err) {
      console.error('Failed to get credentials:', err);
      throw err;
    }
  }

  async createGroup(groupName: string): Promise<void> {
    try {
      if (this.apiEndpoint) {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`${this.apiEndpoint}/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ GroupName: groupName, UserPoolId: this.userPoolId }),
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        console.log('Group created via API:', groupName);
      } else {
        const client = await this.ensureCognitoClient();
        const command = new CreateGroupCommand({
          GroupName: groupName,
          UserPoolId: this.userPoolId,
        });
        await client.send(command);
        console.log('Group created via SDK:', groupName);
      }
    } catch (err: any) {
      console.error('Failed to create group:', JSON.stringify(err, null, 2));
      throw new Error(`Failed to create group: ${err.message}`);
    }
  }

  async listGroups(): Promise<any[]> {
    try {
      if (this.apiEndpoint) {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`${this.apiEndpoint}/groups`, {
          method: 'GET',
          headers,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        const result = await response.json();
        return result.Groups || [];
      } else {
        const client = await this.ensureCognitoClient();
        const command = new ListGroupsCommand({
          UserPoolId: this.userPoolId,
          Limit: 60,
        });
        const result = await client.send(command);
        return result.Groups || [];
      }
    } catch (err: any) {
      console.error('Failed to list groups:', err);
      return [];
    }
  }

  async addUserToGroup(email: string, groupName: string): Promise<void> {
    try {
      if (this.apiEndpoint) {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`${this.apiEndpoint}/groups/${groupName}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ Username: email, UserPoolId: this.userPoolId }),
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        console.log('User added to group via API:', email, groupName);
      } else {
        const client = await this.ensureCognitoClient();
        const command = new AdminAddUserToGroupCommand({
          Username: email,
          GroupName: groupName,
          UserPoolId: this.userPoolId,
        });
        await client.send(command);
        console.log('User added to group via SDK:', email, groupName);
      }
    } catch (err: any) {
      console.error('Failed to add user to group:', err);
      throw new Error(`Failed to add user to group: ${err.message}`);
    }
  }

  async listUsersInGroup(groupName: string): Promise<any[]> {
    try {
      if (this.apiEndpoint) {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`${this.apiEndpoint}/groups/${groupName}/users`, {
          method: 'GET',
          headers,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        const result = await response.json();
        return result.Users || [];
      } else {
        const client = await this.ensureCognitoClient();
        const command = new ListUsersInGroupCommand({
          GroupName: groupName,
          UserPoolId: this.userPoolId,
          Limit: 60,
        });
        const result = await client.send(command);
        return result.Users || [];
      }
    } catch (err: any) {
      console.error('Failed to list users in group:', err);
      return [];
    }
  }

  async removeUserFromGroup(email: string, groupName: string): Promise<void> {
    try {
      if (this.apiEndpoint) {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`${this.apiEndpoint}/groups/${groupName}/users/${email}`, {
          method: 'DELETE',
          headers,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        console.log('User removed from group via API:', email, groupName);
      } else {
        const client = await this.ensureCognitoClient();
        const command = new AdminRemoveUserFromGroupCommand({
          Username: email,
          GroupName: groupName,
          UserPoolId: this.userPoolId,
        });
        await client.send(command);
        console.log('User removed from group via SDK:', email, groupName);
      }
    } catch (err: any) {
      console.error('Failed to remove user from group:', err);
      throw new Error(`Failed to remove user from group: ${err.message}`);
    }
  }

  async deleteGroup(groupName: string): Promise<void> {
    try {
      if (this.apiEndpoint) {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`${this.apiEndpoint}/groups/${groupName}`, {
          method: 'DELETE',
          headers,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        console.log('Group deleted via API:', groupName);
      } else {
        const client = await this.ensureCognitoClient();
        const command = new DeleteGroupCommand({
          GroupName: groupName,
          UserPoolId: this.userPoolId,
        });
        await client.send(command);
        console.log('Group deleted via SDK:', groupName);
      }
    } catch (err: any) {
      console.error('Failed to delete group:', err);
      throw new Error(`Failed to delete group: ${err.message}`);
    }
  }

  async listCognitoUsers(filter?: string): Promise<any[]> {
    try {
      const client = await this.ensureCognitoClient();
      const params = {
        UserPoolId: this.userPoolId,
        Limit: 60,
        Filter: filter ? `email ^= "${filter}"` : undefined,
      };
      const command = new ListUsersCommand(params);
      const result = await client.send(command);
      return result.Users || [];
    } catch (err: any) {
      console.error('Failed to list Cognito users:', err);
      return [];
    }
  }
}