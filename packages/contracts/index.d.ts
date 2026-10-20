export type StatusFilter = 'all' | 'active' | 'completed';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Session {
  token: string;
  user: PublicUser;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  name: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  completed: boolean;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Pick<Task, 'title' | 'description' | 'completed'>;

export type NewTask = Partial<TaskInput> & Pick<TaskInput, 'title'>;

export type TaskPatch = Partial<TaskInput> & { version: number };

export interface TaskFilters {
  q: string;
  status: StatusFilter;
}

export interface FieldError {
  path: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: FieldError[];
  };
}
