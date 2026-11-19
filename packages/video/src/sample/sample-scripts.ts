import type { SceneKind, TemplateId } from '@studio/shared/ace';

export interface SampleBeat {
  onScreenText: string;
  narration: string;
}

interface SampleScript {
  title: string;
  /** Beats per timeline section; several beats split that section evenly. */
  beats: Partial<Record<SceneKind, SampleBeat[]>>;
}

/** Studio preview copy for the meeting-notes example. Not used in production renders. */
export const sampleScripts: Record<TemplateId, SampleScript> = {
  TOOL_DEMO: {
    title: 'AI meeting notes in 60 seconds',
    beats: {
      hook: [{ onScreenText: 'Stop typing meeting notes', narration: 'Still typing meeting notes by hand? Watch this.' }],
      problem: [
        {
          onScreenText: '20 minutes lost after every call',
          narration:
            'Most of us lose about twenty minutes after every call cleaning up notes, chasing action items and writing the follow up email. Across a week that is hours gone.',
        },
      ],
      step: [
        {
          onScreenText: 'Connect your calendar',
          narration:
            'First, connect your calendar. The assistant sees every meeting you have scheduled and asks which ones it should join. You stay in control of what gets recorded, and guests see a clear notice when it joins.',
        },
        {
          onScreenText: 'Let it join the call',
          narration:
            'Second, just run your meeting as usual. It transcribes in real time, labels each speaker and marks the moments where someone commits to doing something, so nothing gets lost in the conversation.',
        },
        {
          onScreenText: 'Review the summary',
          narration:
            'Third, open the summary when the call ends. You get the decisions, the action items with owners and a draft follow up email. Edit anything that looks off, then send it in one click.',
        },
      ],
      result: [
        {
          onScreenText: 'Notes done before you close the tab',
          narration:
            'In our test across ten calls, cleanup time dropped from about twenty minutes to under three. The summaries still needed a quick human check, so always review before you send.',
        },
      ],
      cta: [
        {
          onScreenText: 'Try it on your next call',
          narration: 'Try it on your next call and follow for more tools that give you your time back.',
        },
      ],
    },
  },
  AI_BATTLE: {
    title: 'Which AI writes better meeting notes?',
    beats: {
      hook: [{ onScreenText: 'Two AIs. One meeting.', narration: 'I gave two AI assistants the exact same meeting. Only one got the notes right.' }],
      rubric: [
        {
          onScreenText: 'How we scored them\nAccuracy\nAction items\nSpeed',
          narration:
            'Here is the rubric. Accuracy of the summary, whether every action item has an owner, and how fast the notes were ready after the call ended.',
        },
      ],
      evidence: [
        {
          onScreenText: 'Accuracy',
          narration:
            'Round one, accuracy. Both captured the main decision, but the second assistant invented a deadline nobody mentioned. That is a serious miss for notes you plan to share.',
        },
        {
          onScreenText: 'Action items',
          narration:
            'Round two, action items. The first assistant listed five tasks with clear owners. The second found only three and left two of them without anyone assigned.',
        },
        {
          onScreenText: 'Speed',
          narration:
            'Round three, speed. The second assistant was faster, with notes ready in under a minute, while the first took about two minutes.',
        },
      ],
      analysis: [
        {
          onScreenText: 'Fast is not the same as right',
          narration:
            'Speed is nice, but a made up deadline can cost you far more than a minute of waiting. For notes other people act on, accuracy has to come first.',
        },
      ],
      verdict: [
        {
          onScreenText: 'Winner: the accurate one',
          narration: 'My verdict goes to the first assistant. Follow for the full scoring sheet and the next battle.',
        },
      ],
    },
  },
  AUTOMATION_BLUEPRINT: {
    title: 'Meeting notes that file themselves',
    beats: {
      hook: [{ onScreenText: 'Notes that file themselves', narration: 'This automation writes and files your meeting notes while you grab a coffee.' }],
      overview: [
        {
          onScreenText: 'Zoom -> Transcript -> AI summary -> Notion',
          narration:
            'Here is the blueprint. A recording finishes in Zoom, the transcript is created, an AI step writes the summary and the result lands in your Notion meeting database.',
        },
      ],
      step: [
        {
          onScreenText: 'Trigger on new recording',
          narration:
            'Step one. Create a trigger that fires when a cloud recording is ready. Filter it to the meetings you actually want summarized so private calls stay out of it.',
        },
        {
          onScreenText: 'Summarize the transcript',
          narration:
            'Step two. Send the transcript to an AI step with a clear prompt. Ask for decisions, action items with owners and open questions, in that order, as short bullet points.',
        },
        {
          onScreenText: 'Create the Notion page',
          narration:
            'Step three. Map the summary into a new Notion page with the meeting title, the date and the attendees, and tag every owner so they get notified right away.',
        },
      ],
      result: [
        {
          onScreenText: 'Every meeting, filed automatically',
          narration:
            'Now every recorded meeting shows up in Notion a few minutes later, already organized. Spot check the first few runs to make sure the summaries are accurate.',
        },
      ],
      cta: [
        {
          onScreenText: 'Build it this week',
          narration: 'Build it this week and follow for the next blueprint.',
        },
      ],
    },
  },
};
