import type { Skill, Rule } from './types';

let currentSkills: Skill[] = [];
let currentRules: Rule[] = [];

export function updateSkillOptions(skills: Skill[]): void {
  currentSkills = skills;
}

export function updateRuleOptions(rules: Rule[]): void {
  currentRules = rules;
}

export function getCurrentSkills(): Skill[] {
  return currentSkills;
}

export function getCurrentRules(): Rule[] {
  return currentRules;
}
