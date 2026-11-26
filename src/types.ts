export interface Teacher {
  id: string;
  name: string;
  username: string;
  email: string;
  school: string;
  province?: string;
  level: string;
  status: 'active' | 'inactive';
  avatar?: string;
}
