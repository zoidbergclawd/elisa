export interface Skill {
  id: string;
  name: string;
  prompt: string;
  category: 'agent' | 'feature' | 'style';
}

export interface Rule {
  id: string;
  name: string;
  prompt: string;
  trigger: 'always' | 'on_task_complete' | 'on_test_fail' | 'before_deploy';
}
