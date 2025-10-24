import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { get, post, put, del } from '@aws-amplify/api';
import outputs from '../../../../amplify_outputs.json';

interface RestApiConfig {
  endpoint: string;
}

@Injectable({ providedIn: 'root' })
export class CognitoGroupService {
  private userPoolId: string = outputs.auth?.user_pool_id ?? 'us-west-1_KfNSgZaRI';
  private apiName: string;

  constructor() {
    Amplify.configure(outputs);
    // Dynamically get first (or only) REST API name from outputs.data.api
    const apis = (outputs as any).data?.api;
    this.apiName = apis ? Object.keys(apis)[0] : 'CognitoGroupAPI';
    // Validate config exists
    if (!apis?.[this.apiName]?.endpoint || (apis?.[this.apiName]?.endpoint as string) === 'YOUR_API_GATEWAY_URL') {
      console.warn(`Warning: ${this.apiName} endpoint not deployed. Run 'npx amplify push' to fix.`);
    }
  }

  private async callApi(
    method: 'get' | 'post' | 'put' | 'del',
    args: { path: string; body?: any; queryParams?: Record<string, any> }
  ): Promise<any> {
    const { path, body, queryParams } = args;
    try {
      const request = { apiName: this.apiName, path, options: { body, queryParams } };
      let response: any;
      if (method === 'post') response = await post(request).response;
      else if (method === 'put') response = await put(request).response;
      else if (method === 'del') response = await del(request).response;
      else response = await get(request).response;
      return this.extractBody(response);
    } catch (err: any) {
      console.error(`API ${method.toUpperCase()} ${path} failed:`, err);
      throw new Error(`Cognito API call failed: ${err.message || err}`);
    }
  }

  private extractBody(response: any): any {
    try {
      if (!response?.body) return {};
      return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    } catch (err) {
      console.error('Failed to parse API response:', err);
      return {};
    }
  }

  async createGroup(groupName: string): Promise<void> {
    await this.callApi('post', {
      path: '/groups',
      body: { UserPoolId: this.userPoolId, GroupName: groupName },
    });
  }

  async getGroup(groupName: string): Promise<any> {
    const data = await this.callApi('get', {
      path: `/groups/${groupName}`,
      queryParams: { UserPoolId: this.userPoolId },
    });
    return data.Group ?? data;
  }

  async updateGroup(groupName: string, description?: string): Promise<void> {
    await this.callApi('put', {
      path: `/groups/${groupName}`,
      body: { UserPoolId: this.userPoolId, Description: description },
    });
  }

  async deleteGroup(groupName: string): Promise<void> {
    await this.callApi('del', {
      path: `/groups/${groupName}`,
      queryParams: { UserPoolId: this.userPoolId },
    });
  }

  async listGroups(): Promise<any[]> {
    const data = await this.callApi('get', {
      path: '/groups',
      queryParams: { UserPoolId: this.userPoolId, Limit: 60 },
    });
    return Array.isArray(data.Groups) ? data.Groups : data ?? [];
  }

  async addUserToGroup(email: string, groupName: string): Promise<void> {
    await this.callApi('post', {
      path: `/groups/${groupName}/users`,
      body: { UserPoolId: this.userPoolId, Username: email },
    });
  }

  async removeUserFromGroup(email: string, groupName: string): Promise<void> {
    await this.callApi('del', {
      path: `/groups/${groupName}/users/${email}`,
      queryParams: { UserPoolId: this.userPoolId },
    });
  }

  async listUsersInGroup(groupName: string): Promise<any[]> {
    const data = await this.callApi('get', {
      path: `/groups/${groupName}/users`,
      queryParams: { UserPoolId: this.userPoolId, Limit: 60 },
    });
    return Array.isArray(data.Users) ? data.Users : data ?? [];
  }

  async listCognitoUsers(filter?: string): Promise<any[]> {
    const data = await this.callApi('get', {
      path: '/users',
      queryParams: {
        UserPoolId: this.userPoolId,
        Limit: 60,
        Filter: filter ? `email ^= "${filter}"` : undefined,
      },
    });
    return Array.isArray(data.Users) ? data.Users : data ?? [];
  }
}