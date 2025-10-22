import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { get, post, put, del } from '@aws-amplify/api';
import outputs from '../../../../amplify_outputs.json';

@Injectable({ providedIn: 'root' })
export class CognitoGroupService {
  private userPoolId: string = outputs.auth?.user_pool_id ?? 'us-west-1_KfNSgZaRI';
  private apiName: string = 'CognitoGroupAPI';

  constructor() {
    Amplify.configure(outputs);
  }

  private async callApi(
    method: 'get' | 'post' | 'put' | 'del',
    args: { path: string; body?: any; queryParams?: Record<string, any> }
  ) {
    const { path, body, queryParams } = args;
    const request = { apiName: this.apiName, path, options: { body, queryParams } };
    if (method === 'post') return post(request);
    if (method === 'put') return put(request);
    if (method === 'del') return del(request);
    return get(request);
  }

  private extractBody(response: any): any {
    // Amplify modular API returns { body, statusCode, headers }
    try {
      if (!response) return {};
      if (typeof response.body === 'string') return JSON.parse(response.body);
      if (response.body) return response.body;
      return response;
    } catch {
      return response;
    }
  }

  async createGroup(groupName: string): Promise<void> {
    const res = await this.callApi('post', {
      path: '/groups',
      body: { UserPoolId: this.userPoolId, GroupName: groupName },
    });
    console.log('createGroup response:', this.extractBody(res));
  }

  async getGroup(groupName: string): Promise<any> {
    const res = await this.callApi('get', {
      path: `/groups/${groupName}`,
      queryParams: { UserPoolId: this.userPoolId },
    });
    const data = this.extractBody(res);
    console.log('getGroup:', data.Group ?? data);
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
    const res = await this.callApi('get', {
      path: '/groups',
      queryParams: { UserPoolId: this.userPoolId, Limit: 60 },
    });
    const data = this.extractBody(res);
    console.log('listGroups:', data.Groups ?? data);
    return data.Groups ?? data ?? [];
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
    const res = await this.callApi('get', {
      path: `/groups/${groupName}/users`,
      queryParams: { UserPoolId: this.userPoolId, Limit: 60 },
    });
    const data = this.extractBody(res);
    console.log('listUsersInGroup:', data.Users ?? data);
    return data.Users ?? data ?? [];
  }

  async listCognitoUsers(filter?: string): Promise<any[]> {
    const res = await this.callApi('get', {
      path: '/users',
      queryParams: {
        UserPoolId: this.userPoolId,
        Limit: 60,
        Filter: filter ? `email ^= "${filter}"` : undefined,
      },
    });
    const data = this.extractBody(res);
    console.log('listCognitoUsers:', data.Users ?? data);
    return data.Users ?? data ?? [];
  }
}
