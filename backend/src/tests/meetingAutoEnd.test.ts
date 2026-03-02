import { describe, it, expect } from 'vitest';
import { isClosingQuestion, isAffirmativeResponse, isDismissalQuestion, isNegativeResponse } from '../routes/meetings.js';

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

  it('matches affirmative followed by extra words', () => {
    expect(isAffirmativeResponse("yes let's build it!")).toBe(true);
    expect(isAffirmativeResponse('yeah do it')).toBe(true);
    expect(isAffirmativeResponse('sure thing')).toBe(true);
    expect(isAffirmativeResponse('ok sounds good')).toBe(true);
    expect(isAffirmativeResponse('absolutely love it')).toBe(true);
    expect(isAffirmativeResponse('definitely go for it')).toBe(true);
  });

  it('does not match negative responses', () => {
    expect(isAffirmativeResponse('no')).toBe(false);
    expect(isAffirmativeResponse('nope')).toBe(false);
    expect(isAffirmativeResponse('wait')).toBe(false);
    expect(isAffirmativeResponse('maybe')).toBe(false);
    expect(isAffirmativeResponse('not yet')).toBe(false);
  });
});

describe('isDismissalQuestion', () => {
  it('matches "Anything else you want to know?"', () => {
    expect(isDismissalQuestion('Anything else you want to know?')).toBe(true);
  });

  it('matches "Do you have more questions?"', () => {
    expect(isDismissalQuestion('Do you have more questions?')).toBe(true);
  });

  it('matches "Is there anything else I can help with?"', () => {
    expect(isDismissalQuestion('Is there anything else I can help with?')).toBe(true);
  });

  it('matches "Anything more you want to explore?"', () => {
    expect(isDismissalQuestion('Anything more you want to explore?')).toBe(true);
  });

  it('matches "Is there anything I can explain?"', () => {
    expect(isDismissalQuestion('Is there anything I can explain?')).toBe(true);
  });

  it('matches "Do you need anything else?"', () => {
    expect(isDismissalQuestion('Do you need anything else?')).toBe(true);
  });

  it('matches "Want to know anything else?"', () => {
    expect(isDismissalQuestion('Want to know anything else?')).toBe(true);
  });

  it('matches "Want to ask anything else?"', () => {
    expect(isDismissalQuestion('Want to ask anything else?')).toBe(true);
  });

  it('matches "Want to explore something else?"', () => {
    expect(isDismissalQuestion('Want to explore something else?')).toBe(true);
  });

  it('matches within longer text', () => {
    expect(isDismissalQuestion("That's how the tests work! Anything else you're curious about?")).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isDismissalQuestion('ANYTHING ELSE?')).toBe(true);
    expect(isDismissalQuestion('More Questions?')).toBe(true);
  });

  it('does not match unrelated messages', () => {
    expect(isDismissalQuestion('What color do you want?')).toBe(false);
    expect(isDismissalQuestion('Ready to build?')).toBe(false);
    expect(isDismissalQuestion('Tell me about your project')).toBe(false);
  });
});

describe('isNegativeResponse', () => {
  it('matches "no"', () => {
    expect(isNegativeResponse('no')).toBe(true);
  });

  it('matches "nope"', () => {
    expect(isNegativeResponse('nope')).toBe(true);
  });

  it('matches "nah"', () => {
    expect(isNegativeResponse('nah')).toBe(true);
  });

  it('matches "I\'m good"', () => {
    expect(isNegativeResponse("I'm good")).toBe(true);
  });

  it('matches "im good"', () => {
    expect(isNegativeResponse('im good')).toBe(true);
  });

  it('matches "that\'s all"', () => {
    expect(isNegativeResponse("that's all")).toBe(true);
  });

  it('matches "thats all"', () => {
    expect(isNegativeResponse('thats all')).toBe(true);
  });

  it('matches "all good"', () => {
    expect(isNegativeResponse('all good')).toBe(true);
  });

  it('matches "no thanks"', () => {
    expect(isNegativeResponse('no thanks')).toBe(true);
  });

  it('matches "no thank you"', () => {
    expect(isNegativeResponse('no thank you')).toBe(true);
  });

  it('matches "nothing"', () => {
    expect(isNegativeResponse('nothing')).toBe(true);
  });

  it('matches "that\'s it"', () => {
    expect(isNegativeResponse("that's it")).toBe(true);
  });

  it('matches "all set"', () => {
    expect(isNegativeResponse('all set')).toBe(true);
  });

  it('matches "n"', () => {
    expect(isNegativeResponse('n')).toBe(true);
  });

  it('strips trailing punctuation', () => {
    expect(isNegativeResponse('nope!')).toBe(true);
    expect(isNegativeResponse('no.')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(isNegativeResponse('  nope  ')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isNegativeResponse('NO')).toBe(true);
    expect(isNegativeResponse('Nope')).toBe(true);
    expect(isNegativeResponse("I'm Good")).toBe(true);
  });

  it('does not match affirmative responses', () => {
    expect(isNegativeResponse('yes')).toBe(false);
    expect(isNegativeResponse('sure')).toBe(false);
    expect(isNegativeResponse('ok')).toBe(false);
  });

  it('does not match complex sentences', () => {
    expect(isNegativeResponse('no I want to ask about something')).toBe(false);
    expect(isNegativeResponse('actually yes')).toBe(false);
  });
});
