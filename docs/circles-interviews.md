# Circles interviews

The script and decision rule for testing the Kovrune Circles idea before building it ([issue #36](https://github.com/bowo-prasetyo/kovrune/issues/36)). Circles are milestones M3 to M5 in [`design.md` §12](design.md#12-roadmap): small groups of invited peers whose agents take tasks from each other.

| | |
| --- | --- |
| Status | Script ready; no interviews yet |
| Decides | Go or no-go for M3 ([below](#m3-go-or-no-go)) |
| People | 5–8 interviews. The owner recruits and interviews; Claude writes up the findings |

## The hypothesis

Circles rest on three assumptions. Each can be wrong on its own:

1. **Demand:** people in small groups (a lab, a team) have research tasks they would hand to a teammate's agent.
2. **Sharing:** they would let the documents those tasks need leave their own machine, to a peer they know.
3. **Need for peers:** what they want can't already be done with their own hardware. [`design.md` §6.1](design.md#61-scope-trusted-circles-first) says delegation is worth most when the peer has **more capability** (a desktop with a large model) or **more context** (a teammate who knows the material). The first is mostly covered without any P2P work: the user guide shows how to [use a model server on another computer](user-guide.md#use-a-model-server-on-another-computer). So Circles are needed only for value that comes from **someone else's** machine, documents or knowledge.

## Participants

- **Who:** the first audience in [`design.md` §1.4](design.md#14-target-users), technical researchers comfortable with a terminal. They must work in a group of 2–10 people who share research work: a lab, a research team, an open-source project's maintainers.
- **Mix:** at least two groups, so not everyone comes from one team. At least one person who leads a group and decides its tools.
- **With the usability test:** the interview can follow a [usability session](usability-test.md) as a 15-minute add-on, with the same participant. They have just used Kovrune, so they know what an agent task is. Stand-alone interviews take about 30 minutes.

## Rules for the interviewer

- **Ask about the past, not the future.** "When did you last ask a colleague to look something up for you?" tells more than "Would you use this?". People are polite about hypothetical products.
- **Don't pitch.** Describe Circles only in part 3, after the questions about how they work today.
- **Follow concrete stories.** When they mention a real task, ask what it was, who did it, how long it took, and what they shared.
- **Record their words.** Write down the sentences that answer the questions, not your summary of them.

## Script

### 1. How they work today (about 10 minutes)

1. What does your group work on, and how many of you are there?
2. Tell me about the last time you asked a colleague to find, read or check something for you. What was it? What did you send them? What came back?
3. When a colleague can't help right away, what do you do instead?
4. Which documents do you share inside the group, and which do you keep to yourself? Why?
5. Does anyone in the group use AI models for research? Which ones, on what hardware, and are there rules about what may be sent to them?
6. What computers does the group have: laptops only, or also a desktop or server with a GPU? Who uses it?

### 2. Their own faster computer (about 3 minutes)

Ask only if they have a faster computer than their laptop, or after a usability session where the laptop was slow.

7. If Kovrune could run its model on that computer while you work on your laptop, would you set that up? What would get in the way?

### 3. A teammate's agent (about 10 minutes)

Now describe Circles in one or two sentences, for example:

> Suppose Kovrune could hand a research question to a teammate's Kovrune, which answers it with their documents or their faster model and sends back a checked answer. You decide each time what goes to them.

8. Think of the story from question 2. Would you have sent that task this way instead? Why or why not?
9. What would you be willing to send with a task: the question, some of your documents, all of them? What never?
10. What would stop you, or your group, from using this? (Listen for: data rules, trust in another person's model, their computer being off, setup effort.)
11. Would you let colleagues send tasks to your computer? While you work, or only when you're away from it?

### 4. Close (about 2 minutes)

12. Of everything we discussed, what would save you the most time?
13. Who else should I talk to?

## Results

Copy this for each interview, and keep it in the owner's notes. Write a summary here without names.

```text
Interview:          I_  (group: lab / team / OSS; size _; role)
After usability?    yes / no
Recent delegation:  (question 2: the task, what was shared, what came back)
Hardware:           laptop only / also desktop or server with GPU
Desktop path:       would set up / wouldn't, because…
Would delegate:     yes, with a concrete past task / only hypothetically / no
Would share:        question only / some documents / all / nothing
Value comes from:   more capability / more context / both / neither
Blockers:           (question 10, in their words)
Would accept tasks: yes while working / only when away / no
Most valuable:      (question 12)
Quotes:
```

**Summary for this document:**
- **Counts:** of N interviews, how many named a concrete past task they would have delegated; how many would share at least some documents; how many described value from a teammate's context rather than more capability alone.
- **Blockers:** each one and how many people raised it.
- **Desktop path:** how many have a faster computer, and how many would set it up.

## M3 go or no-go

Decided before the interviews, like the M0 gate, so the findings can't move the bar. With N interviews (at least 5):

- **Go for M3** if at least half name a **concrete past task** they would have delegated to a teammate's agent, **and** at least half of those would share the documents it needs, **and** at least two of them describe value from the teammate's **context** (their documents or knowledge), which a desktop of their own can't give.
- **No-go, re-plan** if the value people describe is mostly **more capability**: the desktop setup already gives that, so improve it instead (for example an API key field for servers on shared networks) and revisit Circles later.
- **No-go, stop** if fewer than a quarter would delegate a past task, or if a blocker such as data rules applies to most groups and Circles can't remove it.

Anything between these is a **no-go for now**: record what would change the answer, and ask again after M2.

The decision, with the counts behind it, goes in [`design.md` §12](design.md#12-roadmap) under M3.
