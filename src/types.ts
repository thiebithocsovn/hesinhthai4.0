export interface Teacher {
  id: string;
  name: string;
  username: string;
  email: string;
  school: string;
  level: string;
  status: 'active' | 'inactive';
  avatar?: string;
}
