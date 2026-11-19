import type { Storyboard } from '../storyboard';

/**
 * C01 "Sua IA faz commit sem pedir?" (roteiros.md). Proof: rules/git.md, the git-write guard.
 * The motif is four notes, one per git write the guard catches (commit, push, merge, PR):
 * four pings open the video and the same four notes resolve with the logo.
 */
export const c01GitGuard: Storyboard = {
  id: 'c01',
  bpm: 100,
  roundToBeats: 2,
  shots: [
    {
      id: 'hook',
      section: 'intro',
      minBeats: 6,
      events: {
        title: { atBeat: 0 },
        ping1: { atBeat: 0.5 },
        ping2: { atBeat: 1 },
        ping3: { atBeat: 1.5 },
        ping4: { atBeat: 2 },
        typeStart: { atBeat: 1 },
        typeEnd: { atBeat: 4.5 },
      },
    },
    {
      id: 'freeze',
      section: 'silence',
      minBeats: 2,
      events: { enter: { atBeat: 0 } },
    },
    {
      id: 'prompt',
      section: 'drop',
      minBeats: 4,
      leadBeats: 1,
      events: { alarm: { atBeat: 0 }, card: { atBeat: 0.25 } },
      line: {
        text: { pt: 'A minha não consegue.', en: "Mine can't." },
        highlight: { pt: 'consegue', en: "can't" },
      },
    },
    {
      id: 'writes',
      section: 'groove',
      minBeats: 8,
      events: {
        pillCommit: { atWord: 'commit' },
        pillPush: { atWord: 'push' },
        pillMerge: { atWord: 'merge' },
        pillPr: { atWord: 'gh' },
      },
      line: {
        text: {
          pt: 'Qualquer comando que escreve no git vira uma pergunta pra mim: commit, push, merge, até um gh pr create.',
          en: 'Every command that writes to git becomes a question for me: commit, push, merge, even gh pr create.',
        },
        highlight: { pt: 'pergunta', en: 'question' },
      },
    },
    {
      id: 'approve',
      section: 'full',
      minBeats: 6,
      leadBeats: 1,
      events: { cursorMove: { atBeat: 0 }, click: { atBeat: 2 }, commitDone: { atBeat: 2.5 } },
      line: {
        text: { pt: 'E uma aprovação vale pra uma ação.', en: 'And one approval covers one action.' },
        highlight: { pt: 'ação', en: 'one' },
      },
    },
    {
      id: 'again',
      section: 'tension',
      minBeats: 6,
      events: {
        pushTyped: { atBeat: 0 },
        alarm: { atWord: 'push', offsetBeats: -0.25 },
        card: { atWord: 'push' },
      },
      line: {
        text: { pt: 'Aprovei o commit? O push pergunta de novo.', en: 'I approved the commit? The push asks again.' },
        highlight: { pt: 'novo', en: 'again' },
      },
    },
    {
      id: 'rule',
      section: 'warm',
      minBeats: 8,
      events: { pullBack: { atBeat: 0 }, highlightRule: { atWord: 'EngineOS' } },
      line: {
        text: {
          pt: 'Isso é uma regra do EngineOS, o framework que eu criei pra usar IA num time de verdade.',
          en: "That's a rule in EngineOS, the framework I built to use AI on a real team.",
        },
        highlight: { pt: 'EngineOS', en: 'EngineOS' },
      },
    },
    {
      id: 'cta',
      section: 'resolve',
      minBeats: 10,
      tailBeats: 3,
      events: { breath: { atBeat: 0 }, dots: { atBeat: 0.5 }, logo: { atBeat: 2 }, cta: { atBeat: 3 } },
      line: {
        text: { pt: 'Link na bio: checklist grátis.', en: 'Link in bio: free checklist.' },
        highlight: { pt: 'grátis', en: 'free' },
      },
    },
  ],
  copy: {
    pt: {
      hook: 'Sua IA faz commit sem pedir?',
      hookHighlight: 'commit',
      userPrompt: 'corrige o redirect do login e sobe pra main',
      claudeSay: 'Vou commitar a correção e subir pra main.',
      cta: 'Link na bio',
      ctaSub: 'checklist grátis',
      ruleCaption: 'rules/git.md',
      disclosure: 'Voz gerada por IA',
      approvedLabel: 'aprovado',
      askedLabel: 'pergunta de novo',
      'slide1.title': 'Sua IA faz commit sem pedir?',
      'slide1.body': 'A minha não consegue. Veja como.',
      'slide2.title': 'Todo comando que escreve no git vira uma pergunta',
      'slide2.body': 'commit, push, merge, até gh pr create',
      'slide3.title': 'O guard intercepta antes de rodar',
      'slide3.body': '[engineos] git write: git push',
      'slide4.title': 'Uma aprovação vale pra uma ação',
      'slide4.body': 'Aprovei o commit? O push pergunta de novo.',
      'slide5.title': 'Não é prompt. É regra.',
      'slide5.body': 'rules/git.md, versionada por PR no EngineOS',
      'slide6.title': 'Link na bio',
      'slide6.body': 'Checklist grátis',
    },
    en: {
      hook: 'Does your AI commit without asking?',
      hookHighlight: 'commit',
      userPrompt: 'fix the login redirect and ship it to main',
      claudeSay: "I'll commit the fix and push it to main.",
      cta: 'Link in bio',
      ctaSub: 'free checklist',
      ruleCaption: 'rules/git.md',
      disclosure: 'AI-generated voice',
      approvedLabel: 'approved',
      askedLabel: 'asks again',
      'slide1.title': 'Does your AI commit without asking?',
      'slide1.body': "Mine can't. Here's how.",
      'slide2.title': 'Every command that writes to git becomes a question',
      'slide2.body': 'commit, push, merge, even gh pr create',
      'slide3.title': 'The guard stops it before it runs',
      'slide3.body': '[engineos] git write: git push',
      'slide4.title': 'One approval covers one action',
      'slide4.body': 'Approved the commit? The push asks again.',
      'slide5.title': 'Not a prompt. A rule.',
      'slide5.body': 'rules/git.md, versioned through PRs in EngineOS',
      'slide6.title': 'Link in bio',
      'slide6.body': 'Free checklist',
    },
  },
};
