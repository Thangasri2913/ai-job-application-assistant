# Learn & Prepare

Learn & Prepare helps users build the skills for the roles they want, through practice rather than long theory. Users can browse and pick any course, whether or not it matches their resume. They can also get a personalised plan from a resume they own and a target role.

Design decisions:

- [ADR-0021](adr/0021-learn-and-prepare.md): a static, provenance-labelled catalogue.
- [ADR-0022](adr/0022-interactive-learning-and-recommendations.md): interactive learning, progress and recommendations.
- [ADR-0023](adr/0023-practice-projects-and-job-readiness.md): interview practice, project challenges and job readiness.
- [ADR-0024](adr/0024-adaptive-learning-revision-analytics.md): adaptive next steps, revision, analytics and preferences.

Endpoints are listed in the [API reference](API.md#learn--prepare).

## Status

| Area                                                                                                                                                                              | Status                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course catalogue: search, category/skill/difficulty filters, course detail, planned courses                                                                                       | **Implemented**                                                                                                                                          |
| Interactive lessons: short explanation, "go deeper", examples with expected output, graded activities with feedback, hints, retries, hands-on exercises, recap, curated resources | **Implemented** for the four skill courses. The two career tracks have explanations, examples, exercises and one knowledge check in each of five lessons |
| Diagnostic assessment (level 0), with suggestions to skim or study per lesson                                                                                                     | **Implemented** for the four skill courses                                                                                                               |
| Course selection ("My learning"), lesson completion, activity attempts, assessment results, skill evidence; saved per user and available on any device                            | **Implemented**                                                                                                                                          |
| Dashboard: next lesson, progress, remaining time, items to revise, assessed skills                                                                                                | **Implemented**                                                                                                                                          |
| Resume-based plan: evidence per skill, user corrections, learning sequence, next steps                                                                                            | **Implemented** (deterministic, no AI)                                                                                                                   |
| Skill-demand evidence                                                                                                                                                             | **Partial**: curated role skill lists plus skills observed in the user's own analysed jobs. No external labour-market data source                        |
| AI-generated practice                                                                                                                                                             | **Foundation only**: a validated, provider-independent generator with fallbacks. Not exposed in the UI or API yet                                        |
| Code execution, adaptive remediation beyond hints and retries, certificates, mobile screens                                                                                       | **Not built**                                                                                                                                            |

## Content

### Courses

| Course                        | Format       | Category                | What it contains                                             |
| ----------------------------- | ------------ | ----------------------- | ------------------------------------------------------------ |
| JavaScript essentials         | Skill course | Software development    | 5 lessons with graded activities, a diagnostic and a project |
| SQL fundamentals              | Skill course | Data                    | 6 lessons with graded activities, a diagnostic and a project |
| Software testing fundamentals | Skill course | Quality assurance       | 4 lessons with graded activities, a diagnostic and a project |
| Generative AI fundamentals    | Skill course | AI and machine learning | 4 lessons with graded activities, a diagnostic and a project |
| Frontend Developer            | Career track | Software development    | 7 modules, 5 knowledge checks                                |
| Backend Developer             | Career track | Software development    | 7 modules, 5 knowledge checks                                |

These are all **planned** and contain no curriculum: Full Stack track, TypeScript, Angular, Python, Java, system design, data analysis, data engineering, machine learning, LLM applications, MLOps, cloud and DevOps, web security, security operations, Playwright automation, and UI/UX.

Every role in `LEARNING_ROLES` has a curated role profile and at least one course. The validator enforces this.

### Skill progression

Lessons sit at levels 1–6, and level 0 is the course diagnostic:

| Level | Stage                     |
| ----- | ------------------------- |
| 0     | Diagnostic                |
| 1     | Fundamentals              |
| 2     | Core concepts             |
| 3     | Independent practice      |
| 4     | Intermediate application  |
| 5     | Advanced design decisions |
| 6     | Real-world project        |

A course shows the range of levels it covers.

The progression adapts to the learner:

- When every diagnostic question on a lesson's topic is answered correctly, that lesson is marked **"Skim"**, and "next lesson" skips it.
- Wrong practice answers get an explanation, an optional hint and a retry, and they appear under **"To revise"** on the dashboard.

### Lesson pattern

1. A short explanation in plain language, with an optional "Go deeper" section.
2. A worked example, with its **expected output written by the author** (code is never run).
3. Interactive activities:
   - multiple choice, in the variants knowledge check, code reading, debugging, SQL, scenario and design decision;
   - fill-in-the-gap;
   - short answer, including "predict the output";
   - practical checklists;
   - reflections;
   - revision cards.
4. Feedback on each answer explains why it is right or wrong.
5. A hands-on exercise with "done when" criteria, and a mini-project per course.
6. A recap, and a link to the next lesson or the project.

## Architecture

```
packages/shared/src/learning.ts            Public contract: courses, activities (no answers), attempts,
                                           diagnostics, progress, dashboard, recommendations
apps/api/src/modules/learning/
  catalogue/content.ts                     Authoring types; zod schemas for activities and diagnostic
                                           questions (with answers); provenance; curated RESOURCES
  catalogue/skills.ts, roles.ts            Skill registry; role profiles (curated core skills)
  catalogue/<course>.ts, planned.ts        One file per course; announced courses
  catalogue/index.ts                       CATALOGUE + validateCatalogue()
  catalogue/build.ts                       Builds public shapes (answers stripped) + grading index
  grading.ts                               Deterministic grading; nothing is executed
  learning.service.ts                      Catalogue: search, filters, lookups (validated at start-up)
  learning-progress.service.ts             Enrolments, completions, attempts, diagnostics, dashboard
  recommendations/resume-evidence.ts       Skill evidence from a resume (pure, local)
  recommendations/skill-demand.service.ts  Skills observed in the user's analysed jobs
  recommendations/learning-recommendations.service.ts
  ai/practice-activity-generator.ts        Foundation for AI-drafted practice (not exposed)
  learning.controller.ts, dto/             /api/v1/learning/...
apps/web/src/features/learn/               Catalogue, course, lesson, diagnostic, My learning, plan
```

### Course content: static and code-reviewed

Course content is **static, typed and code-reviewed**. The API validates it when it starts and refuses to start if it is invalid; unit tests run the same check. The rules are:

- ids are slugs and unique within their kind;
- module and lesson order runs 1..n with no gaps;
- every activity and diagnostic question passes its zod schema, with exactly one correct option and unique option and gap ids;
- skills referenced by courses, lessons, resources and roles exist;
- prerequisite courses exist;
- resource URLs use https;
- a planned course has no content;
- a review date requires REVIEWED provenance;
- every role has a profile and a course.

### Answers stay on the server

Course and diagnostic responses never include correct options, accepted answers, per-option feedback or explanations; unit and e2e tests check this. The server grades each answer and returns feedback only after submission.

### Grading

Grading is deterministic. Typed answers are compared after trimming, collapsing whitespace, ignoring case, and removing one pair of wrapping quotes or a trailing semicolon.

A blank short answer, or a fill-in-the-gap answer with every gap blank, is rejected with 400 and is **not recorded**. The web form explains what is missing before sending anything. Every other submission is stored as a new attempt, so repeated answers are numbered 1, 2, 3… and the latest one decides whether the activity appears under "To revise". Fill-in-the-gap answers are scored per gap. Checklists are recorded as self-assessed and never graded. Reflections and revision cards are never sent to the server.

### Data model

All data is per user and keyed by the authenticated user. Catalogue ids are stored as text, not foreign keys. These are additive tables (migration `20261017100000_learning_progress`):

| Table                          | Holds                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `learning_enrollments`         | Courses the user selected ("My learning")                                                  |
| `learning_lesson_completions`  | Lessons the user marked complete. Self-reported, **not** skill evidence                    |
| `learning_activity_attempts`   | Every practice answer as validated, plus whether it was correct and its score. Append-only |
| `learning_assessment_attempts` | Diagnostic results: score, and per-topic and per-question results                          |
| `learning_skill_evidence`      | Correct/total per skill **from assessments only**                                          |

Recording progress in a course (an answer, a completion or a diagnostic) adds the course to "My learning". Removing a course from "My learning" keeps its recorded history. Courses or lessons later removed from the catalogue are skipped in the dashboard (retired content).

## Personalised plan: how recommendations are produced

1. **The user chooses** a target role and, optionally, one of their resume versions. A new resume is uploaded through the existing resume library, and its reviewed content is used.
2. **Resume evidence.** The user's version is loaded through `ResumesService.getVersionContent(userId, versionId)`; another user's id behaves as missing (404).
   - For each catalogue skill, matching is literal: the skill's canonical name and its listed spellings in the skills section and technology lists, plus the shared skill dictionary and the canonical name in experience, project, headline and summary text. A skill is never inferred from a related one (Java is not JavaScript).
   - The result is `NONE`, `LISTED` (named only) or `APPLIED` (used in experience or a project), with up to three short excerpts and their context.
3. **Assessment evidence.** Diagnostic skill evidence counts **answered questions only**; a skipped question means "not yet known", not "wrong", and a diagnostic with no answers is rejected.
   - A skill counts as **measured** only when the latest diagnostic asked at least `SKILL_EVIDENCE_MIN_QUESTIONS` (3) questions about it. It is then "fundamentals demonstrated" at 80% or more correct, and "developing" below that.
   - With fewer questions, the result is reported (for example "1 of 1 correct — too few to measure") but proficiency stays `UNKNOWN`. For example, the SQL diagnostic measures SQL (6 questions) but not PostgreSQL or data modelling (1 question each).
   - **Proficiency is `UNKNOWN` unless an assessment measured it.** A resume mention never sets it.
4. **User corrections.** "I have this skill" or "I don't have this skill yet" override the evidence for this request only. They are sent with each request and **not stored**.
5. **Gap.** A core skill for the role is a gap when:
   - the user says it is missing; or
   - the diagnostic shows it is still developing; or
   - there is no evidence of use, unless the user says they have it or a diagnostic demonstrated it.

   Confidence is HIGH for a measured skill, MEDIUM for applied evidence or a user statement, and LOW otherwise. Each skill states its remaining uncertainty.

   Each skill also carries a `basis`, shown as a label in the plan:

   | Basis             | Label              | Meaning                                                 |
   | ----------------- | ------------------ | ------------------------------------------------------- |
   | `USER_CORRECTED`  | You corrected this | The user's correction decides it, for this request only |
   | `MEASURED`        | Measured           | A diagnostic asked enough questions                     |
   | `RESUME_EVIDENCE` | From your resume   | Inferred from the resume; not measured                  |
   | `UNKNOWN`         | Unknown            | No evidence yet                                         |

   The plan page explains these labels.

6. **Next step for each skill:**
   - continue a course already started;
   - take a diagnostic when there is some evidence (or the user claims the skill) but nothing has been measured;
   - start a course;
   - practise; or
   - "no course yet", naming the planned course.
7. **Course sequence.** The most direct published skill course is chosen for each gap skill; the role's career track covers any remaining gaps. Courses are ordered by prerequisites, then difficulty, then coverage, up to five.
8. **Evidence panels:**
   - the role's curated core skills, labelled _not market statistics_;
   - **skills observed in the user's own analysed jobs**: the top skills by number of postings, with required/preferred counts and the analysis date range. Jobs are matched to the role by whole-word title keywords (so "api" does not match "rapid"), and development sample postings are excluded. Each panel lists its limitations.

Nothing in this flow calls an AI provider, writes to the resume, or stores the analysis.

### Resume-analysis limitations

- Only reviewed (confirmed) resume content is used. A version without it returns 409 `RESUME_CONTENT_MISSING`.
- Name matching misses skills described in other words, and it may count a name used in an unrelated sense. The user can correct both.
- Evidence describes what the resume says, not how well the user knows a skill.
- Diagnostics are short and test fundamentals only.

## Provenance and external resources

| Content                                                                 | Label                                                                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Lessons, activities, exercises, projects, diagnostics, role skill lists | `origin: AI_GENERATED`, `review: UNREVIEWED`. Shown as "AI-generated · Not yet reviewed" |
| JobAssist-written content                                               | `origin: ORIGINAL` (none yet)                                                            |
| External links                                                          | `provenance: CURATED`, with `skillIds` and a `linkCheck`                                 |

- **Reviewed** content (`review: { status: 'REVIEWED', reviewedBy, reviewedAt }`) and a course's `lastReviewedOn` may be set only after a named person has actually reviewed it. Today no content is reviewed and every `lastReviewedOn` is `null`.
- **Link check** means the URL answered HTTP 200 when requested on 2026-10-17; the final URL after redirects is stored. It is not a review of the page. A URL that has not been requested must use `NOT_CHECKED`.
- External pages are linked, never copied, fetched or scraped by the app. Only https URLs are rendered as links, and they open in a new tab with `noopener noreferrer`. Lesson text is rendered as plain text, never as HTML.

## AI-generated content (foundation)

`PracticeActivityGenerator.draft({ skill, level, topic })` works as follows:

- It goes through the existing `AiService`, so it is provider-independent and validated with zod, and API keys stay on the server.
- It returns `UNAVAILABLE` when `AI_PROVIDER=none` (the default). No API key is needed to browse or study.
- It sends only the skill, level and topic, never resume or progress data.
- Output must pass the same activity schema as static content, limited to the gradable types. Any link in the output rejects it, because citations must be curated.
- Its provenance is always set to AI-generated and unreviewed by the code, not by the model.
- Provider and validation errors become a generic `FAILED` status, and the raw output is never logged or returned.

Still to do: an endpoint and UI to request drafts, review and approval before publishing, usage metering through `AiUsageService`, and rate limits.

## How to add content

- **A skill:** add it to `catalogue/skills.ts`, with a slug id, canonical name, category and spellings that mean the _same_ skill.
- **A role:**
  1. Add it to `LEARNING_ROLES` and `LEARNING_ROLE_LABELS` in `packages/shared/src/learning.ts`.
  2. Add a profile to `catalogue/roles.ts`, with core skills and title keywords.
  3. Make sure at least one course lists the role.
  4. Run `npm run build:shared`.
- **A planned course:** add a `planned({...})` entry to `catalogue/planned.ts`.
- **A full course:**
  1. Create `catalogue/<course-id>.ts`, exporting a `CourseSource`. Copy the structure of `sql-fundamentals.ts`.
  2. Remove the course's planned entry and add the new course to `CATALOGUE` in `catalogue/index.ts`.
  3. Give lessons `level`, `skillIds`, `activities`, `recap` and `estimatedMinutes`. Give modules and lessons `order` 1..n, and use globally unique slug ids for lessons and activities.
  4. Give each graded activity an `explanation`, and give each multiple-choice option its own `feedback`. Exactly one option must be correct. Add `commonMistakes` for predictable wrong short answers.
  5. Add a `diagnostic` with at least one question per lesson topic, each pointing at a lesson in the course.
  6. Mark authored content `AI_UNREVIEWED` unless a person wrote it (`ORIGINAL`) or reviewed it (`REVIEWED`, with a reviewer and date).
  7. Add resources to `RESOURCES` only after opening the URL yourself. Use `REACHABLE` with today's date only if it answered 200; otherwise use `NOT_CHECKED`.
- **Check:** run `npm test -w @job-assist/api`. The integrity test lists every rule a change breaks.

Ids are **stable**. Once released, don't rename course, lesson or activity ids, because progress rows reference them.

## Learner experience details

- **Drafts.** Answers typed or chosen in activities and in a diagnostic, and the last checked result, are kept in memory for the browser tab. Moving between lessons or pages does not discard them. Nothing is written to browser storage; checked answers are saved on the server as attempts.
- **Feedback.**
  - Checking an answer moves keyboard focus to the feedback, which is also announced through a live region.
  - Wrong answers link back to the lesson's explanation.
  - "To revise" items on the dashboard link straight to the activity (`#activity-<id>`).
- **Completion.**
  - Marking a lesson complete is self-reported, and no other completion rule exists.
  - The lesson page says how many practice activities are still unanswered, and announces the outcome when the lesson is marked complete.
  - The button is disabled while progress is loading or could not be loaded, so a stale state cannot be toggled.
- **Diagnostics.** Results explain each Skim/Study suggestion ("1 of 1 question correct…") and mark skipped questions as "Not answered". Lessons the diagnostic suggests skimming explain why on the lesson page, and note that this is not proof of mastery.
- **States.**
  - Progress-loading errors on course and lesson pages show a message with "Try again".
  - The catalogue announces "N courses found" or "Updating results…", and marks courses already in "My learning", with a "Continue" link.
  - Duplicate submissions are blocked while a request is in flight.
- **Narrow screens.** Long lesson-navigation buttons wrap, and the observed-demand table scrolls horizontally inside its card.

This has been checked with automated role, label and focus tests only. No manual screen-reader or WCAG audit has been done.

## Interview practice, projects and job readiness (ADR-0023)

| Area                                                                                                                                                                                         | Status                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Interview practice: 21 written-answer questions over 13 skills, filtered by role, skill, course or difficulty; rule-based feedback; example answer; attempt history and retries              | **Implemented**                                                               |
| Project challenges: 3 challenges (frontend job board, applications REST API, SQL analytics) with objectives, criteria, steps, test cases, self-review and extensions; self-reported progress | **Implemented**                                                               |
| Job readiness for one of the user's analysed jobs                                                                                                                                            | **Implemented** (no job data means a clear empty state; learning still works) |
| Readiness on the dashboard, with an explained next action                                                                                                                                    | **Implemented**                                                               |
| AI-assisted interview feedback                                                                                                                                                               | **Not built.** Feedback is deterministic only                                 |

### Reused, not duplicated

- **Interview module:** its rule evaluator (`evaluateWithRules`) scores clarity and length. Its application-bound sessions and tables are unchanged.
- **Jobs:** each user's analysed jobs and their extracted SKILL requirements.
- **Learn & Prepare:**
  - the skill registry, and `createSkillLookup` (shared with observed demand);
  - `LearningRecommendationsService.assessSkills`, the plan's rules, now shared with job readiness;
  - lesson revision links and the single dashboard.

### Interview practice feedback

| Dimension    | Shown as     | How it is judged                                                                                                                                                                                   |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness  | Key concepts | Share of the question's rubric concepts the answer mentions, matched by phrase patterns. It cannot confirm that everything written is accurate, and it can miss correct points phrased differently |
| Clarity      | Clarity      | The interview rules: sentence length, structure and vague phrases                                                                                                                                  |
| Completeness | Length       | The interview rules: words compared with a typical answer (50 / 80 / 110 words by difficulty)                                                                                                      |

- Missing concepts link to the lesson that teaches them.
- The example answer is labelled "one of many valid answers". Rubric concepts and example answers are never sent before an answer is submitted.
- Blank, malformed or oversized answers (over 10,000 characters) are rejected and not stored.
- Every attempt is kept (append-only) with the rubric version, and listed newest first.
- A unit test checks that every question's own example answer satisfies its rubric, which catches patterns that are too narrow.

### Project challenges

- Progress (`NOT_STARTED`, `IN_PROGRESS` or `COMPLETED`, plus the ticked checklist items) is saved per user and labelled self-reported.
- A project can be marked complete only when every acceptance criterion is ticked.
- JobAssist never runs, uploads or inspects project code.

### Job readiness

`POST /learning/job-readiness` takes one of the user's analysed jobs (other users' jobs return 404), an optional resume version (defaulting to the one selected for the job), and optional corrections. Corrections are not stored. For each skill the job requests, it returns:

- **the job side:** required or preferred; stated in the posting or inferred from the description;
- **the user side:** the plan's `SkillAssessment` with its basis — measured, you corrected this, from your resume, or unknown. Skills not in the catalogue are shown as such, with no links;
- **links:** courses, lessons, project challenges and the number of interview questions for that skill.

The summary gives separate counts by basis. It is not a score, and nothing is labelled "job-ready".

### Dashboard readiness and the next action

The dashboard shows:

- projects started;
- interview practice (attempts, recent questions, and concepts missing from each question's latest attempt, with lessons to revise);
- skills that diagnostics flag (still developing, or too few questions to measure);
- counts of real analysed jobs.

The next action is chosen in this fixed order, and always shows its reason:

1. Revise an activity whose last answer was wrong.
2. Continue a project in progress.
3. Continue the next lesson.
4. Revise a concept missing from an interview answer.
5. Take a pending diagnostic.
6. Start or choose a course.

## Adaptive learning, revision and analytics (ADR-0024)

### Data used

These are all existing, persisted records owned by the user:

- course selections and lesson completions;
- every practice answer, with correctness and time;
- the latest diagnostic per course, using answered questions only;
- per-skill assessment evidence;
- interview attempts and their missing concepts;
- project progress;
- the user's analysed jobs;
- learning preferences (new).

Resume evidence comes from the default resume, read through the plan's owner-scoped assessment and never copied. Skill corrections made in the plan are still not stored.

### Revision (`/learn/revision`, `GET /learning/revision`)

| Situation                                     | Status            |
| --------------------------------------------- | ----------------- |
| Last answer wrong                             | Due now           |
| Mistake corrected in the same visit           | Back after 1 day  |
| One later visit answered correctly first time | Back after 3 days |
| Two such visits                               | Cleared           |

- Tries within 10 minutes count as one visit, so experimenting is not treated as repeated mistakes.
- Topics are grouped by lesson. Due topics come first, with repeated mistakes (mistakes on more than one visit) ahead of single ones.
- Each topic says why it is listed, for example "You answered 1 question in this lesson incorrectly (2 incorrect attempts across 2 visits)". A topic notes when a lesson the diagnostic suggested skimming had later mistakes.
- Reviewing a topic shows the questions to retry plus _different_ questions from the same lesson, never-tried ones first. Answers go through the normal grading endpoint, so new attempts are recorded as usual.
- Diagnostic questions answered wrong (skipped ones are excluded) stay until the lesson is completed or answered correctly afterwards. Concepts missing from the latest interview answer stay until a later answer covers them.

### Next steps (`GET /learning/next-steps`; the top step is the dashboard's next action)

| Order | Step                           | Example reason (built from the user's data)                                                                                     | Confidence                         |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1     | Practice mistakes due          | "You answered 2 questions in this lesson incorrectly…"                                                                          | HIGH if repeated, otherwise MEDIUM |
| 2     | Project in progress            | "…ticked 2 of 5 acceptance criteria."                                                                                           | HIGH                               |
| 3     | Next lesson                    | "You completed "X", the lesson before it in SQL fundamentals."                                                                  | HIGH                               |
| 4     | Pending diagnostic             | "Take a diagnostic to establish your current level…"                                                                            | MEDIUM                             |
| 5     | Diagnostic or interview topics | "…you answered 1 question on this topic incorrectly."                                                                           | LOW                                |
| 6     | Target-role skills             | "SQL is a core skill for Data Analyst, your target role, and it has not been measured yet." (adds resume evidence when present) | MEDIUM, or HIGH when measured      |
| 7     | Analysed-job skills            | "React appears in 2 jobs you analysed (1 as required)."                                                                         | MEDIUM with 2+ jobs, otherwise LOW |
| 8     | Next course                    | "You completed JavaScript essentials and SQL fundamentals, which this course builds on."                                        | HIGH                               |
| 9     | Interests                      | "Matches your interest in SQL."                                                                                                 | MEDIUM                             |
| 10    | Defaults                       | A beginner course with no prerequisites, and an optional prompt to set preferences — no resume or role needed                   | LOW                                |

Users can dismiss any step ("Not now") and show dismissed steps again. The response's `basedOn` says what was available, and the UI says when suggestions are general because there is little activity yet.

### Analytics (on My learning)

All figures are calculated from persisted records on request:

- courses started, and courses with every lesson marked complete;
- lessons marked complete (self-reported);
- practice answers, and different questions answered;
- **first-try accuracy**: shown only with at least 5 different questions, with the counts behind it, and not changed by retries;
- skills measured, assessed with too few questions, or unknown;
- target-role progress (core skills measured and demonstrated), shown only with a target role;
- revision counts, interview answers and project counts;
- daily activity for the last 14 days;
- this week's estimated minutes (from completed lessons' stated lengths) next to an optional goal.

There are no streaks, no scores and no shame-based messages.

### Preferences (`GET`/`PUT /learning/preferences`)

All fields are optional:

- target role;
- interest categories;
- up to 20 interest skills;
- a weekly goal from 30, 60, 120, 180 or 300 minutes.

PUT replaces them (idempotent). Unknown roles, categories, skills or goals are rejected with 400.

## Running it locally

```bash
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"
npm run build:shared
# Apply the learning migrations (20261017100000_learning_progress,
# 20261018100000_learning_practice_and_projects and 20261019100000_learning_preferences)
# to your LOCAL development database only:
#   cd apps/api && DATABASE_URL=<local url> DIRECT_DATABASE_URL=<local url> npx prisma migrate deploy
npm run dev            # then open http://localhost:<web port>/learn

npm test -w @job-assist/api                                   # unit tests
npm test -w @job-assist/web                                   # web tests
(cd apps/api && npx vitest run --config ./vitest.config.e2e.ts test/learning.e2e-spec.ts)   # needs TEST_DATABASE_URL
```
