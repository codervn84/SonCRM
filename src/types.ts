export type CustomerStatus = 'Lead' | 'Contact' | 'Customer' | 'Inactive';
export type InteractionType = 'Call' | 'Email' | 'Meeting' | 'Note';
export type TaskStatus = 'Pending' | 'Completed';

export interface Customer {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  status: CustomerStatus;
  source?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id?: string;
  customerId: string;
  type: InteractionType;
  content: string;
  date: string;
  ownerId: string;
}

export interface Task {
  id?: string;
  customerId: string;
  title: string;
  dueDate?: string;
  status: TaskStatus;
  ownerId: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
    tenantId: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
