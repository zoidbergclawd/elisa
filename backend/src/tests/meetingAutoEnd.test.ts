import { describe, it, expect } from 'vitest';
import { isClosingQuestion, isAffirmativeResponse } from '../routes/meetings.js';

describe('isClosingQuestion', () => {
  it('matches "Ready to build?"', () => {
    expect(isClosingQuestion('Ready to build?')).toBe(true);
  });

  it('matches "Are you ready to start?"', () => {
    expect(isClosingQuestion('Are you ready to start?')).toBe(true);
  });

  it('matches "Shall we get started?"', () => {
    expect(isClosingQuestion('Shall we get started?')).toBe(true);
  });

  it('matches "Want to see it come to life?"', () => {
    expect(isClosingQuestion('Want to see it come to life?')).toBe(true);
  });

  it('matches "Should we tell the team to start building?"', () => {
    expect(isClosingQuestion('Should we tell the team to start building?')).toBe(true);
  });

  it('matches "Let\'s build it!"', () => {
    expect(isClosingQuestion("Let's build it!")).toBe(true);
  });

  it('matches "lets do this"', () => {
    expect(isClosingQuestion('lets do this')).toBe(true);
  });

  it('matches "Want me to save everything?"', () => {
    expect(isClosingQuestion('Want me to save everything?')).toBe(true);
  });

  it('matches within longer text', () => {
    expect(isClosingQuestion('Great choices! Are you ready to build?')).toBe(true);
  });

  it('matches "Ready to see your UFO come to life?"', () => {
    expect(isClosingQuestion('Ready to see your UFO come to life?')).toBe(true);
  });

  it('matches "Want to start building?"', () => {
    expect(isClosingQuestion('Want to start building?')).toBe(true);
  });

  it('matches "Should we tell Star Builder to code these?"', () => {
    expect(isClosingQuestion('Should we tell Star Builder to code these?')).toBe(true);
  });

  it('matches "Time to build!"', () => {
    expect(isClosingQuestion('Time to build!')).toBe(true);
  });

  it('does not match unrelated messages', () => {
    expect(isClosingQuestion('What color do you want?')).toBe(false);
    expect(isClosingQuestion('Tell me more about your project')).toBe(false);
    expect(isClosingQuestion('I like your idea!')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isClosingQuestion('READY TO BUILD?')).toBe(true);
    expect(isClosingQuestion('SHALL WE START?')).toBe(true);
  });
});

describe('isAffirmativeResponse', () => {
  it('matches "yes"', () => {
    expect(isAffirmativeResponse('yes')).toBe(true);
  });

  it('matches "yeah"', () => {
    expect(isAffirmativeResponse('yeah')).toBe(true);
  });

  it('matches "yep"', () => {
    expect(isAffirmativeResponse('yep')).toBe(true);
  });

  it('matches "yup"', () => {
    expect(isAffirmativeResponse('yup')).toBe(true);
  });

  it('matches "sure"', () => {
    expect(isAffirmativeResponse('sure')).toBe(true);
  });

  it('matches "ok"', () => {
    expect(isAffirmativeResponse('ok')).toBe(true);
  });

  it('matches "okay"', () => {
    expect(isAffirmativeResponse('okay')).toBe(true);
  });

  it('matches "let\'s go"', () => {
    expect(isAffirmativeResponse("let's go")).toBe(true);
  });

  it('matches "lets go"', () => {
    expect(isAffirmativeResponse('lets go')).toBe(true);
  });

  it('matches "do it"', () => {
    expect(isAffirmativeResponse('do it')).toBe(true);
  });

  it('matches "build it"', () => {
    expect(isAffirmativeResponse('build it')).toBe(true);
  });

  it('matches "go for it"', () => {
    expect(isAffirmativeResponse('go for it')).toBe(true);
  });

  it('matches "absolutely"', () => {
    expect(isAffirmativeResponse('absolutely')).toBe(true);
  });

  it('matches "definitely"', () => {
    expect(isAffirmativeResponse('definitely')).toBe(true);
  });

  it('matches "go ahead"', () => {
    expect(isAffirmativeResponse('go ahead')).toBe(true);
  });

  it('matches "y"', () => {
    expect(isAffirmativeResponse('y')).toBe(true);
  });

  it('strips trailing punctuation', () => {
    expect(isAffirmativeResponse('yes!')).toBe(true);
    expect(isAffirmativeResponse('yes!!')).toBe(true);
    expect(isAffirmativeResponse('yes.')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(isAffirmativeResponse('  yes  ')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isAffirmativeResponse('YES')).toBe(true);
    expect(isAffirmativeResponse('Sure')).toBe(true);
    expect(isAffirmativeResponse('Y')).toBe(true);
  });

  it('does not match sentences or complex responses', () => {
    expect(isAffirmativeResponse('yes I want to build something cool')).toBe(false);
    expect(isAffirmativeResponse('no')).toBe(false);
    expect(isAffirmativeResponse('wait')).toBe(false);
    expect(isAffirmativeResponse('maybe')).toBe(false);
    expect(isAffirmativeResponse('not yet')).toBe(false);
  });
});
