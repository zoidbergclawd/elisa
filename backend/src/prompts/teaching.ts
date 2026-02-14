/** Teaching curriculum and prompt helpers. */

export interface TeachingMomentData {
  concept: string;
  headline: string;
  explanation: string;
  tell_me_more: string;
}

export const CONCEPT_CURRICULUM: Record<string, Record<string, TeachingMomentData>> = {
  source_control: {
    first_commit: {
      concept: 'source_control',
      headline: 'Your helpers are saving their work!',
      explanation:
        "Your helpers are saving their work to a place called GitHub. " +
        "Think of it like a shared notebook -- everyone can see what changed and when. " +
        "Each save is called a 'commit' -- it's like a snapshot of your nugget at that moment.",
      tell_me_more:
        'Every commit has a short message that says what changed. ' +
        'This way, if something breaks, the team can look back and find exactly when it happened. ' +
        "It's like a time machine for your code!",
    },
    multiple_commits: {
      concept: 'source_control',
      headline: 'Multiple saves -- building a history!',
      explanation:
        'See how there are several commits now? Each one is a small, safe step forward. ' +
        'Real software teams make lots of small saves instead of one giant one. ' +
        "That way, if something goes wrong, they only have to undo a little bit.",
      tell_me_more:
        'Professional developers might make dozens of commits in a single day. ' +
        "The key is to keep each commit focused on one thing -- like fixing a bug or adding a button.",
    },
    commit_messages: {
      concept: 'source_control',
      headline: 'Good commit messages tell a story',
      explanation:
        'Notice how each save has a message? Good messages explain *what* changed and *why*. ' +
        "This helps everyone on the team understand the nugget's history.",
      tell_me_more:
        "A great commit message is short but clear, like 'Add login button to homepage'. " +
        "Avoid vague messages like 'fixed stuff' -- future you will thank present you!",
    },
  },
  testing: {
    first_test_run: {
      concept: 'testing',
      headline: 'Your nugget is being tested!',
      explanation:
        'A tester agent is checking that your nugget works correctly. ' +
        'Tests are like a checklist -- they try out different parts of your nugget ' +
        "and make sure each one does what it's supposed to.",
      tell_me_more:
        'Automated tests run the same checks every time, so you never forget to test something. ' +
        "It's like having a robot quality inspector who never gets tired!",
    },
    test_pass: {
      concept: 'testing',
      headline: 'Tests are passing!',
      explanation:
        'Great news -- the tests show that your nugget is working correctly! ' +
        'A passing test means the code does exactly what was expected. ' +
        'Green checkmarks mean everything is on track.',
      tell_me_more:
        "In real software teams, code doesn't get released until all tests pass. " +
        "This is called a 'quality gate' -- it keeps bugs from reaching users.",
    },
    test_fail: {
      concept: 'testing',
      headline: "Some tests found issues -- that's okay!",
      explanation:
        "Some tests didn't pass, which means there might be a bug. " +
        "Don't worry -- finding bugs is exactly what tests are for! " +
        "It's better to catch problems now than after your nugget is finished.",
      tell_me_more:
        'When a test fails, developers look at which test broke and what it expected. ' +
        'Then they fix the code and run the tests again. This cycle of test-fix-test is totally normal.',
    },
    coverage: {
      concept: 'testing',
      headline: 'Test coverage -- how much is tested?',
      explanation:
        'Coverage tells you what percentage of your code is being tested. ' +
        'Higher coverage means more of your nugget has been checked. ' +
        "It's like knowing how many rooms in a house have been inspected.",
      tell_me_more:
        "100% coverage doesn't mean zero bugs, but it means every line of code " +
        'has been exercised at least once. Most teams aim for 70-90% coverage.',
    },
  },
  decomposition: {
    task_breakdown: {
      concept: 'decomposition',
      headline: 'Breaking a big job into smaller pieces!',
      explanation:
        'Your nugget has been broken down into smaller tasks. ' +
        "This is called 'decomposition' -- taking a big, complicated goal " +
        'and splitting it into manageable pieces that different helpers can work on.',
      tell_me_more:
        'Decomposition is one of the most important skills in computing. ' +
        'Even huge projects like video games or social media apps start by breaking ' +
        'the work into hundreds of small, clear tasks.',
    },
    dependencies: {
      concept: 'decomposition',
      headline: 'Some tasks depend on others!',
      explanation:
        'See the arrows between tasks? Those show dependencies -- ' +
        'some tasks need to wait until others are finished first. ' +
        "It's like how you need to mix the batter before you can bake a cake.",
      tell_me_more:
        'The computer figures out the right order automatically -- ' +
        "it's like sorting recipe steps so you never need an ingredient you haven't made yet. " +
        'Tasks with no dependencies can run at the same time (in parallel), ' +
        'which makes the whole nugget finish faster.',
    },
  },
  hardware: {
    gpio: {
      concept: 'hardware',
      headline: "GPIO -- your board's connections to the world!",
      explanation:
        "GPIO stands for 'General Purpose Input/Output' -- they're the pins on your " +
        'board that can either send signals out (like turning on an LED) or read signals ' +
        "in (like checking if a button is pressed).",
      tell_me_more:
        'Each pin has a number, and you can set it to be an input or output in your code. ' +
        "When it's an output, you can turn it on (high voltage) or off (low voltage). " +
        "When it's an input, you can read whether something is connected or pressed.",
    },
    lora: {
      concept: 'hardware',
      headline: 'LoRa -- long-range walkie-talkies for electronics!',
      explanation:
        'LoRa is a way for your boards to talk to each other wirelessly -- even from ' +
        "really far away! It's like walkie-talkies for your electronics.",
      tell_me_more:
        'LoRa can send messages over a kilometer away, even through walls! ' +
        "It uses very little power, so your board's battery lasts a long time. " +
        "The tradeoff is that it can only send small messages, not big files or videos.",
    },
    compilation: {
      concept: 'hardware',
      headline: 'Checking your code before sending it to the board!',
      explanation:
        'Before your code goes to the ESP32, a tool checks it for mistakes -- like a ' +
        "spell-checker for code. If something doesn't look right, it tells you exactly " +
        'where the problem is so you can fix it before uploading.',
      tell_me_more:
        'This checking step catches typos and syntax errors early. ' +
        "It's much faster to fix a mistake on your computer than to wonder " +
        'why the board is not doing what you expected!',
    },
    flashing: {
      concept: 'hardware',
      headline: 'Flashing -- sending code to your board!',
      explanation:
        'Flashing means sending your compiled code to the board. It goes through the USB ' +
        "cable and gets stored in the board's memory. Once it's there, the board runs your " +
        'code every time it turns on!',
      tell_me_more:
        "The word 'flash' comes from 'flash memory' -- a type of storage that keeps data " +
        "even when the power is off. It's the same technology in USB drives and SD cards. " +
        'You can flash your board as many times as you want with new code.',
    },
  },
  prompt_engineering: {
    first_skill: {
      concept: 'prompt_engineering',
      headline: "You just wrote your first skill -- that's prompt engineering!",
      explanation:
        'When you write detailed instructions for your AI helpers, that\'s called ' +
        "'prompt engineering'. The better your instructions, the better the result. " +
        "It's like giving really clear directions to a friend.",
      tell_me_more:
        'Prompt engineering is one of the newest and most important skills in tech. ' +
        "The trick is being specific: instead of 'make it cool', try 'use bright neon " +
        "colors on a dark background with smooth animations'.",
    },
    first_rule: {
      concept: 'prompt_engineering',
      headline: 'Rules help your agents stay on track!',
      explanation:
        'Rules are like guardrails for your AI helpers. They make sure your agents ' +
        'follow important guidelines every time, not just when they remember to.',
      tell_me_more:
        "In real software teams, these are called 'linting rules' or 'code standards'. " +
        'They catch mistakes automatically so the team can focus on building cool stuff.',
    },
    composite_skill: {
      concept: 'prompt_engineering',
      headline: 'You built a multi-step skill -- nice work!',
      explanation:
        'A composite skill chains multiple steps together: ask questions, branch on answers, ' +
        'and run different agents. It is like writing a recipe with decision points -- ' +
        '"if the user wants chocolate, do this; if vanilla, do that."',
      tell_me_more:
        'Composite skills can even call other skills inside them, like nesting functions ' +
        'in a program. This lets you build complex workflows from simple, reusable pieces.',
    },
    context_variables: {
      concept: 'prompt_engineering',
      headline: 'Context variables connect your skill steps!',
      explanation:
        'When you use {{key}} in a prompt, the skill engine replaces it with a value ' +
        'from an earlier step. It is like filling in blanks on a form -- each step ' +
        'can read what the previous steps wrote.',
      tell_me_more:
        'Context flows from parent skills to child skills too. If a skill calls another ' +
        'skill, the inner skill can read the outer skill\'s values. This is similar to ' +
        'how variables work in programming -- inner scopes can see outer scopes.',
    },
  },
  code_review: {
    first_review: {
      concept: 'code_review',
      headline: 'A teammate is reviewing the code!',
      explanation:
        'A reviewer agent is looking at the code another agent wrote. ' +
        "Code review is when a teammate checks your work before it's finished -- " +
        "just like peer editing an essay. Fresh eyes catch mistakes!",
      tell_me_more:
        'In professional software teams, every change gets reviewed by at least one other person. ' +
        'Reviewers look for bugs, suggest improvements, and make sure the code is easy to understand.',
    },
    review_feedback: {
      concept: 'code_review',
      headline: 'The reviewer left feedback!',
      explanation:
        'The reviewer found some things that could be improved. ' +
        "Feedback isn't criticism -- it's a gift! Every suggestion " +
        'makes the code better and helps the team learn.',
      tell_me_more:
        "Good feedback is specific and kind. Instead of 'this is wrong', " +
        "a great reviewer says 'this could break if the user enters a negative number -- " +
        "how about adding a check?'",
    },
    review_approval: {
      concept: 'code_review',
      headline: 'Code review approved!',
      explanation:
        "The reviewer says the code looks good! This is called an 'approval'. " +
        "It means a teammate has checked the work and agrees it's ready to go.",
      tell_me_more:
        'Getting an approval feels great, but the real value of review ' +
        'is the conversation it creates. Even approved code might get suggestions for next time.',
    },
  },
};

export function getCurriculumMoment(
  concept: string,
  subConcept: string,
): TeachingMomentData | null {
  return CONCEPT_CURRICULUM[concept]?.[subConcept] ?? null;
}

export const TEACHING_SYSTEM_PROMPT =
  'You are a friendly teaching assistant for kids aged 8-14 who are learning about ' +
  'software engineering by watching AI agents build their nuggets. ' +
  'Explain concepts in simple, encouraging language. Use analogies kids can relate to. ' +
  'Keep explanations to 2-3 sentences. Always be encouraging and never condescending. ' +
  'You MUST respond with a JSON object containing exactly these keys: ' +
  '"concept" (string), "headline" (string), "explanation" (string), "tell_me_more" (string). ' +
  'Output ONLY valid JSON -- no markdown, no commentary.';

export function teachingUserPrompt(
  eventType: string,
  eventDetails: string,
  nuggetType = 'software',
): string {
  return (
    `A kid is watching their ${nuggetType} nugget being built by AI agents. ` +
    `The following event just happened: ${eventType}. ` +
    `Details: ${eventDetails}. ` +
    'Generate a short, kid-friendly teaching moment about this. ' +
    'Respond as JSON with keys: concept, headline, explanation, tell_me_more'
  );
}
