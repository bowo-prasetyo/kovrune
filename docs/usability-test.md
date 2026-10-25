# M1 usability test

The protocol for the usability test in [M1 slice 4](m1-plan.md#slices). It checks two M1 acceptance criteria:

- **5. Usability:** at least 3 of 5 test users complete setup and one research task without help.
- **1. Time to first answer** under 15 minutes, including setup.

## Participants

Recruit 3–5 people who haven't used Kovrune. Aim for a mix:

- at least one on a **class 1** laptop (8 GB of memory, integrated graphics), who will use the local-server path;
- at least one on a **class 2** machine (Apple silicon, or a recent NVIDIA or AMD GPU), who will use the browser path. This also covers the open slice 3 check;
- at least two who aren't software developers, but who are comfortable installing apps and typing commands they are given.

Each person brings a PDF of their own (a report, manual or paper with selectable text) and knows one question it answers.

## Session

Each session takes about 45 minutes, in person or over a screen share. One moderator also takes notes.

**Before:**
- Check the participant has Node.js 22 or newer and git, or let installing them count as part of setup.
- Don't install anything else for them.
- For the local-server path, they follow the [user guide](user-guide.md) from section 3. Hand them the guide, not instructions of your own.

**Say at the start:** "We're testing the app, not you. Please think aloud: say what you're looking for and what you expect. I'll mostly stay quiet; if you're stuck, tell me, and I'll note where."

**Help rule:** if the participant asks for help or is stuck for 3 minutes, give the smallest hint that unblocks them and record it. A task completed after a hint counts as *with help*.

### Tasks

Start the timer at task 1 and stop it when the first answer appears in task 4.

1. "Using this guide, start Kovrune on your computer." (`git clone` … `npm run dev`, then open the address.)
2. "Set Kovrune up so that it can answer questions." This covers the device step, the model (the local server or the browser download) and the model test. A browser download of 1–2.4 GB counts toward the time; note its share separately.
3. "Add your PDF."
4. "Ask the question you brought, and tell me whether you trust the answer, and why."
5. "Ask something your PDF doesn't cover." (Suggest one if needed.)
6. *(Optional, if time allows)* "Turn on Wikipedia and ask a general question about your PDF's topic."

### Questions after the tasks

1. What does the label on your answer (for example **Quotes found**) mean?
2. How would you check whether the answer is right?
3. What was the most confusing moment?
4. Would you use this for real work? What would stop you?
5. Where do you think your documents and questions went?

Questions 1, 2 and 5 check whether the trust and privacy messages come across. A participant who reads **Quotes found** as "the answer is correct" is a finding even if they completed every task.

## Results sheet

Copy this for each participant.

```text
Participant:            P_  (developer / non-developer)
Machine:                OS, CPU, RAM, GPU; hardware class 1/2/3
Path:                   browser / local server (llama.cpp / Ollama)
Model:                  Qwen3.5-4B / 2B

Task 1 start app:       done / with help / not done   time __   notes
Task 2 setup:           done / with help / not done   time __   (download __ min)
Task 3 add PDF:         done / with help / not done
Task 4 own question:    label shown ______   answer correct? yes / partly / no
                        trusts it? ______ why ______
Task 5 not covered:     label shown ______   correct refusal? yes / no
Task 6 Wikipedia:       done / skipped        label ______ correct? ______

Time to first answer:   __ min (from task 1 to the first answer in task 4)
Hints given:            where, and what was said
Errors seen:            messages, as shown
Answers to questions:   1 ______ 2 ______ 3 ______ 4 ______ 5 ______
```

## Reporting

Summarize the sessions in `m1-plan.md` under slice 4:

- **Counts:** how many of N completed setup and task 4 without help (target ≥ 3 of 5), and the time to first answer per participant (target under 15 minutes).
- **Findings:** where people got stuck, which messages were misread, and how answer quality compared with each participant's own judgement.

Each finding should be specific enough to fix, for example "P2 thought the Test model step had frozen during the 40-second check". Open an issue for each one that needs a code or docs change.

Before writing anything up, ask participants for permission to quote them, and don't record their documents or their machines' details beyond what is listed above.
