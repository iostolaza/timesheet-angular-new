// file: src/app/core/services/cognito-group.service.ts
import { Injectable } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class CognitoGroupService {
  private client: CognitoIdentityProviderClient;
  private userPoolId: string = 'us-west-1_KfNSgZaRI';

  constructor() {
    this.client = new CognitoIdentityProviderClient({
      region: 'us-west-1',
    });
  }

  async createGroup(groupName: string): Promise<void> {
    try {
      const command = new CreateGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
      });
      await this.client.send(command);
      console.log(`Group ${groupName} created successfully`);
    } catch (error: any) {
      console.error('Error creating group:', error);
      throw new Error(`Failed to create group: ${error.message || error}`);
    }
  }

  async getGroup(groupName: string): Promise<any> {
    try {
      const command = new GetGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
      });
      const response = await this.client.send(command);
      console.log(`Retrieved group ${groupName}:`, response.Group);
      return response.Group;
    } catch (error: any) {
      console.error('Error getting group:', error);
      throw new Error(`Failed to get group: ${error.message || error}`);
    }
  }

  async updateGroup(groupName: string, description?: string): Promise<void> {
    try {
      const command = new UpdateGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
        Description: description,
      });
      await this.client.send(command);
      console.log(`Group ${groupName} updated successfully`);
    } catch (error: any) {
      console.error('Error updating group:', error);
      throw new Error(`Failed to update group: ${error.message || error}`);
    }
  }

  async deleteGroup(groupName: string): Promise<void> {
    try {
      const command = new DeleteGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
      });
      await this.client.send(command);
      console.log(`Group ${groupName} deleted successfully`);
    } catch (error: any) {
      console.error('Error deleting group:', error);
      throw new Error(`Failed to delete group: ${error.message || error}`);
    }
  }

  async listGroups(): Promise<any[]> {
    try {
      const command = new ListGroupsCommand({
        UserPoolId: this.userPoolId,
        Limit: 60,
      });
      const response = await this.client.send(command);
      console.log('Listed groups:', response.Groups);
      return response.Groups || [];
    } catch (error: any) {
      console.error('Error listing groups:', error);
      throw new Error(`Failed to list groups: ${error.message || error}`);
    }
  }

  async addUserToGroup(email: string, groupName: string): Promise<void> {
    try {
      const command = new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: groupName,
      });
      await this.client.send(command);
      console.log(`User ${email} added to group ${groupName}`);
    } catch (error: any) {
      console.error('Error adding user to group:', error);
      throw new Error(`Failed to add user to group: ${error.message || error}`);
    }
  }

  async removeUserFromGroup(email: string, groupName: string): Promise<void> {
    try {
      const command = new AdminRemoveUserFromGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: groupName,
      });
      await this.client.send(command);
      console.log(`User ${email} removed from group ${groupName}`);
    } catch (error: any) {
      console.error('Error removing user from group:', error);
      throw new Error(`Failed to remove user from group: ${error.message || error}`);
    }
  }

  async listUsersInGroup(groupName: string): Promise<any[]> {
    try {
      const command = new ListUsersInGroupCommand({
        UserPoolId: this.userPoolId,
        GroupName: groupName,
        Limit: 60,
      });
      const response = await this.client.send(command);
      console.log(`Listed users in group ${groupName}:`, response.Users);
      return response.Users || [];
    } catch (error: any) {
      console.error('Error listing users in group:', error);
      throw new Error(`Failed to list users in group: ${error.message || error}`);
    }
  }
}